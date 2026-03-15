// Bookmark system for shinbun readers
// Uses localStorage to save reading position per book

const Bookmark = {
  KEY_PREFIX: 'shinbun_bookmark_',

  // Get the book id from the URL path (e.g. "karamazov" or "sailor")
  getBookId() {
    const path = window.location.pathname;
    const match = path.match(/\/shinbun\/(\w+)\//);
    return match ? match[1] : null;
  },

  // Get current page number from URL
  getPageNum() {
    const match = window.location.pathname.match(/page(\d+)\.html/);
    return match ? parseInt(match[1]) : null;
  },

  // Save bookmark for current book
  save(pageNum, pageTitle) {
    const bookId = this.getBookId();
    if (!bookId) return;
    const data = {
      page: pageNum || this.getPageNum(),
      title: pageTitle || document.title,
      timestamp: Date.now(),
      url: window.location.pathname
    };
    localStorage.setItem(this.KEY_PREFIX + bookId, JSON.stringify(data));
  },

  // Load bookmark for a book
  load(bookId) {
    const raw = localStorage.getItem(this.KEY_PREFIX + (bookId || this.getBookId()));
    return raw ? JSON.parse(raw) : null;
  },

  // Clear bookmark
  clear(bookId) {
    localStorage.removeItem(this.KEY_PREFIX + (bookId || this.getBookId()));
  },

  // Auto-save on page visit (call from reader pages)
  autoSave() {
    const pageNum = this.getPageNum();
    if (pageNum) {
      this.save(pageNum);
    }
  },

  // Render bookmark banner on index page
  renderBanner(bookId, containerSelector) {
    const bm = this.load(bookId);
    if (!bm) return;

    const ago = this._timeAgo(bm.timestamp);
    const container = document.querySelector(containerSelector || 'header');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = 'bookmark-banner';
    banner.innerHTML = `
      <a href="${bm.url}" class="bookmark-resume">
        <span class="bookmark-icon">🔖</span>
        <span class="bookmark-text">
          <strong>Continue reading</strong> — Page ${bm.page}
          <span class="bookmark-ago">${ago}</span>
        </span>
        <span class="bookmark-arrow">›</span>
      </a>
      <button class="bookmark-clear" title="Clear bookmark">✕</button>
    `;

    banner.querySelector('.bookmark-clear').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      Bookmark.clear(bookId);
      banner.remove();
    });

    container.after(banner);
  },

  // Highlight current page in page list
  highlightCurrent() {
    const bookId = this.getBookId();
    const bm = this.load(bookId);
    if (!bm) return;

    const links = document.querySelectorAll('.page-list a');
    links.forEach(a => {
      if (a.getAttribute('href') === `page${bm.page}.html`) {
        a.classList.add('bookmarked');
      }
    });
  },

  _timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
};

// CSS for bookmark elements (injected once)
(function() {
  if (document.getElementById('bookmark-styles')) return;
  const style = document.createElement('style');
  style.id = 'bookmark-styles';
  style.textContent = `
    .bookmark-banner {
      display: flex; align-items: center; gap: 8px;
      margin: 16px 0 8px; padding: 0;
      background: #fff9ee; border: 2px solid #c0a882;
      border-radius: 12px; overflow: hidden;
    }
    .bookmark-resume {
      flex: 1; display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; text-decoration: none; color: #2c2c2c;
    }
    .bookmark-resume:active { opacity: 0.7; }
    .bookmark-icon { font-size: 1.5rem; flex-shrink: 0; }
    .bookmark-text { flex: 1; font-size: 0.9rem; line-height: 1.4; }
    .bookmark-text strong { color: #8b1a1a; }
    .bookmark-ago { display: block; font-size: 0.78rem; color: #888; }
    .bookmark-arrow { font-size: 1.2rem; color: #c0a882; flex-shrink: 0; }
    .bookmark-clear {
      background: none; border: none; color: #bbb; font-size: 1rem;
      padding: 14px 14px 14px 0; cursor: pointer;
    }
    .bookmark-clear:hover { color: #888; }
    .page-list a.bookmarked {
      background: #fff0d0; border-radius: 6px;
      position: relative;
    }
    .page-list a.bookmarked::before {
      content: '🔖'; position: absolute; left: -24px; top: 50%;
      transform: translateY(-50%); font-size: 0.9rem;
    }
  `;
  document.head.appendChild(style);
})();
