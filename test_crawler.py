# -*- coding: utf-8 -*-
"""crawler.py 单元测试 - TDD验证核心功能"""
import unittest
from unittest.mock import patch, MagicMock
import sys, os, json
sys.path.insert(0, '/www/dashboard')
import crawler as C

class TestParseLikes(unittest.TestCase):
    """TDD-1: parse_likes 点赞数解析"""
    def test_wan(self):
        self.assertEqual(C._parse_likes('1.2万'), 12000)
    def test_wan_integer(self):
        self.assertEqual(C._parse_likes('10万'), 100000)
    def test_normal(self):
        self.assertEqual(C._parse_likes('5000'), 5000)
    def test_comma(self):
        self.assertEqual(C._parse_likes('1,234'), 1234)
    def test_zero(self):
        self.assertEqual(C._parse_likes('0'), 0)
    def test_invalid_returns_zero(self):
        self.assertEqual(C._parse_likes('abc'), 0)
    def test_whitespace_stripped(self):
        self.assertEqual(C._parse_likes('  1.5万  '), 15000)

class TestCookieList(unittest.TestCase):
    """TDD-2: _cookie_list cookie解析"""
    def test_basic(self):
        result = C._cookie_list('a=1; b=2')
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['name'], 'a')
        self.assertEqual(result[0]['value'], '1')
        self.assertEqual(result[1]['name'], 'b')
        self.assertEqual(result[1]['value'], '2')
    def test_domain_and_path(self):
        result = C._cookie_list('sessionid=abc')
        self.assertEqual(result[0]['domain'], '.douyin.com')
        self.assertEqual(result[0]['path'], '/')
    def test_empty(self):
        result = C._cookie_list('')
        self.assertEqual(result, [])
    def test_value_with_equals(self):
        result = C._cookie_list('token=a=b=c')
        self.assertEqual(result[0]['name'], 'token')
        self.assertEqual(result[0]['value'], 'a=b=c')

class TestIdentifyMovieBlogger(unittest.TestCase):
    """TDD-3: identify_movie_blogger 影视博主识别（mock API）"""
    @patch('crawler.call_text_api')
    def test_yes(self, mock_api):
        mock_api.return_value = 'YES'
        self.assertTrue(C.identify_movie_blogger('电影解说', '专注电影', ['电影解说']))
    @patch('crawler.call_text_api')
    def test_no(self, mock_api):
        mock_api.return_value = 'NO'
        self.assertFalse(C.identify_movie_blogger('美食博主', '吃播', ['美食']))
    @patch('crawler.call_text_api')
    def test_yes_case_insensitive(self, mock_api):
        mock_api.return_value = 'yes'
        self.assertTrue(C.identify_movie_blogger('test', '', None))
    @patch('crawler.call_text_api')
    def test_prompt_contains_nickname(self, mock_api):
        mock_api.return_value = 'YES'
        C.identify_movie_blogger('测试昵称', '简介', ['tag1'])
        call_args = mock_api.call_args[0][0]
        self.assertIn('测试昵称', call_args)
        self.assertIn('tag1', call_args)

class TestStep5Identify(unittest.TestCase):
    """TDD-4: step5_identify 片名识别（mock API+下载）"""
    def test_empty_returns_empty(self):
        result = C.step5_identify([], max_workers=1)
        self.assertEqual(result, {})
    @patch('crawler.call_vl_api')
    @patch('urllib.request.urlopen')
    def test_basic_mapping(self, mock_urlopen, mock_vl):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'fake_image_data'
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp
        mock_vl.return_value = '测试影片名'
        videos = [{'video_id': 'v1', 'cover': 'http://x.com/1.jpg', 'title': 't1', 'tags': ['tag1']}]
        result = C.step5_identify(videos, max_workers=1)
        self.assertIn('v1', result)
        self.assertEqual(result['v1'], '测试影片名')
    @patch('crawler.call_vl_api')
    @patch('urllib.request.urlopen')
    def test_no_cover_returns_empty(self, mock_urlopen, mock_vl):
        videos = [{'video_id': 'v2', 'cover': '', 'title': 't2', 'tags': []}]
        result = C.step5_identify(videos, max_workers=1)
        self.assertEqual(result['v2'], '')
        mock_vl.assert_not_called()

class TestConfigIO(unittest.TestCase):
    """TDD-5: 配置读写"""
    def test_load_config_returns_dict(self):
        cfg = C.load_config()
        self.assertIsInstance(cfg, dict)
    def test_config_has_dy_cookie_key(self):
        cfg = C.load_config()
        self.assertIn('dy_cookie', cfg)

class TestSkipBloggers(unittest.TestCase):
    """TDD-6: skip_bloggers 读写"""
    def test_load_returns_list(self):
        result = C.load_skip_bloggers()
        self.assertIsInstance(result, list)
    def test_save_and_reload(self):
        test_data = [{'sec_user_id': 'test_skip_123', 'nickname': '测试跳过'}]
        C.save_skip_bloggers(test_data)
        reloaded = C.load_skip_bloggers()
        self.assertEqual(len(reloaded), 1)
        self.assertEqual(reloaded[0]['sec_user_id'], 'test_skip_123')
        # 清理
        C.save_skip_bloggers([])

if __name__ == '__main__':
    unittest.main(verbosity=2)

