// Client-side filtering for the All Games page + fullscreen button on game pages.
(function () {
  'use strict';

  // --- live filter on /games.html ---------------------------------------
  var input = document.getElementById('filter-input');
  var grid = input && document.querySelector('.grid');
  var noResults = document.getElementById('no-results');

  function applyFilter(q) {
    if (!grid) return;
    q = (q || '').trim().toLowerCase();
    var cards = grid.querySelectorAll('.card');
    var shown = 0;
    cards.forEach(function (c) {
      var hay = c.getAttribute('data-search') || '';
      var match = !q || hay.indexOf(q) !== -1;
      c.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    if (noResults) noResults.hidden = shown !== 0;
  }

  if (input) {
    // seed from ?q= (header search submits here)
    var params = new URLSearchParams(location.search);
    var q0 = params.get('q');
    if (q0) {
      input.value = q0;
      applyFilter(q0);
    }
    input.addEventListener('input', function () {
      applyFilter(input.value);
    });
  }

  // --- fullscreen on a game page ----------------------------------------
  var fsBtn = document.getElementById('fs-btn');
  if (fsBtn) {
    fsBtn.addEventListener('click', function () {
      var el = document.querySelector('.player');
      if (!el) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    });
  }
})();
