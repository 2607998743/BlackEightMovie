
/* ===== 组件内部箭头图标（替代异常element-icons字体） ===== */
(function(){
  function arrowSvg(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  }
  function inject(){
    document.querySelectorAll('.el-select__caret, .el-submenu__icon-arrow').forEach(function(i){
      if(i.querySelector('svg')) return;
      i.innerHTML = arrowSvg();
      // 禁用字体伪元素
      i.style.setProperty('--icon-font','none');
      var st = document.createElement('style');
      st.textContent = '.el-select__caret::before, .el-submenu__icon-arrow::before { content: none !important; } .el-select__caret svg, .el-submenu__icon-arrow svg { width: 1em !important; height: 1em !important; display: block; }';
      document.head.appendChild(st);
    });
  }
  inject();
  new MutationObserver(inject).observe(document.body, {childList:true, subtree:true});
})();

;

(function () {
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  window.historyOpen = function () {
    el('historyMask').classList.add('show');
    el('historyPanel').classList.add('show');
    var localHist = (typeof MONITOR_HISTORY !== 'undefined') ? MONITOR_HISTORY : [];
    renderHistory(localHist);
  };
  window.historyClose = function () {
    el('historyMask').classList.remove('show');
    el('historyPanel').classList.remove('show');
  };
  function renderHistory(list) {
    var box = el('historyBody');
    if (!list || !list.length) {
      box.innerHTML = '<div class="history-empty">还没有抓取记录<br>跑完一次一键抓取后，汇总报告会自动记录到这里</div>';
      return;
    }
    var html = '';
    list.slice().reverse().forEach(function (h) {
      if (h && h.action === 'skip') {
        html += '<div class="hitem">' +
          '<div class="htime">' + esc(h.time) + ' 定时判断</div>' +
          '<div class="hrow" style="color:#f59e0b">跳过：' + esc(h.note || '未触发采集') + '</div>' +
          '</div>';
        return;
      }
      var names = (h.new_bloggers || []).map(function (n) { return '<span class="hn">' + esc(n) + '</span>'; }).join('');
      var fails = (h.fails || []).map(function (n) { return '<span class="hn err">' + esc(n) + '</span>'; }).join('');
      var failLen = (h.fails || []).length;
      html += '<div class="hitem">' +
        '<div class="htime">' + esc(h.time) + ' 一次一键补全</div>' +
        '<div class="hrow">老博主新增万赞 <b>' + (h.old_new_count || 0) + '</b> 条</div>' +
        '<div class="hrow">新影视博主 <b>' + (h.new_bloggers || []).length + '</b> 位：' + (names || '<span style="color:#9ca3af">无</span>') + '</div>' +
        '<div class="hrow' + (failLen ? ' err' : '') + '">抓取失败博主 <b>' + failLen + '</b> 位（下次优先重跑）：' + (fails || '<span style="color:#9ca3af">无</span>') + '</div>' +
        '</div>';
    });
    box.innerHTML = html;
  }
  el('historyMask').addEventListener('click', window.historyClose);
})();
