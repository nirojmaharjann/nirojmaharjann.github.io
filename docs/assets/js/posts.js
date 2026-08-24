/* ============================================================
   Blog posts registry — THE place to add a new blog post.

   How to publish a new post:
   1. Copy docs/blog/TEMPLATE-post.html  ->  docs/blog/<your-slug>.html
      and fill in the placeholders / write the content.
   2. Add one entry to the top of the POSTS array below
      (newest first). The listing pages update automatically.

   date format: YYYY-MM-DD (used for sorting, newest shown first)
   ============================================================ */

var BLOG_POSTS = [
    {
        slug: 'github-actions-zero-downtime',
        title: 'Zero-Downtime Deployments with GitHub Actions',
        excerpt: 'A practical pipeline that builds, scans and rolls out containers to Kubernetes without a maintenance window.',
        tag: 'CI/CD',
        date: '2026-08-12',
        readTime: '6 min read'
    },
    {
        slug: 'docker-image-slim',
        title: 'Shrinking Docker Images: 1.2 GB → 120 MB',
        excerpt: 'Multi-stage builds, alpine bases and layer hygiene — how image size affects both speed and security.',
        tag: 'Docker',
        date: '2026-07-28',
        readTime: '5 min read'
    },
    {
        slug: 'kubernetes-first-cluster',
        title: 'Lessons from My First Kubernetes Cluster',
        excerpt: 'The mistakes I made bootstrapping a cluster from scratch — and the config I\'d use again today.',
        tag: 'Kubernetes',
        date: '2026-06-15',
        readTime: '7 min read'
    }
];

/* ------------------------------------------------------------
   Renderers (no need to touch anything below this line)
   ------------------------------------------------------------ */

(function () {
    'use strict';

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /** "2026-08-12" -> "Aug 12, 2026" */
    function prettyDate(iso) {
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var parts = iso.split('-');
        return months[+parts[1] - 1] + ' ' + (+parts[2]) + ', ' + parts[0];
    }

    function sortedPosts() {
        return BLOG_POSTS.slice().sort(function (a, b) {
            return b.date.localeCompare(a.date);
        });
    }

    function cardHtml(post) {
        var href = post.slug.indexOf('/') === -1 ? post.slug + '.html' : post.slug;
        return '' +
            '<article class="post-card">' +
            '<div class="post-meta"><span class="chip">' + esc(post.tag) + '</span>' +
            '<span>' + esc(prettyDate(post.date)) + '</span>' +
            '<span>· ' + esc(post.readTime) + '</span></div>' +
            '<h3><a href="' + esc(href) + '">' + esc(post.title) + '</a></h3>' +
            '<p>' + esc(post.excerpt) + '</p>' +
            '<a class="read-more" href="' + esc(href) + '">read post →</a>' +
            '</article>';
    }

    /**
     * Fill a container with post cards.
     * @param {string} containerId - id of the target element
     * @param {number} [limit] - max number of posts (omit for all)
     */
    window.renderPostCards = function (containerId, limit) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var posts = sortedPosts();
        if (limit) posts = posts.slice(0, limit);
        el.innerHTML = posts.length
            ? posts.map(cardHtml).join('')
            : '<p class="sub">No posts yet — check back soon.</p>';
    };

    document.addEventListener('DOMContentLoaded', function () {
        // Auto-render standard containers if present on the page.
        window.renderPostCards('latest-posts-grid', 3);
        window.renderPostCards('post-list');
    });
})();
