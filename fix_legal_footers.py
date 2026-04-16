import os

files = ['privacy.html', 'terms.html', 'return.html']
css_target = """/* ── FOOTER REDESIGN ── */"""
css_replacement = """/* ── FOOTER ── */
footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 40px 20px; background: white; border-top: 1px solid rgba(192,21,42,0.1);
  margin-top: 60px;
}
.footer-text { font-size: 13px; color: var(--muted); }
.footer-links { display: flex; gap: 24px; }
.footer-links a { font-size: 13px; color: var(--muted); text-decoration: none; transition: color 0.2s; }
.footer-links a:hover { color: var(--crimson); }"""

# Since I already messed up some files, I'll search for the site-footer block too
html_target_start = '<footer class="site-footer">'
html_target_end = '</footer>'
html_replacement = """<footer>
  <div class="footer-text">© 2026 Saarthi — Developed by Harsh & Shreya</div>
  <div class="footer-links">
    <a href="index.html">Home</a>
    <a href="about.html">About</a>
    <a href="login.html">Login</a>
    <a href="post-request.html">Post Request</a>
  </div>
</footer>"""

for f in files:
    if not os.path.exists(f): continue
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace CSS (handle different messed up states)
    if '/* ── FOOTER REDESIGN ── */' in content:
        # find end of the block (before the next style)
        start_idx = content.find('/* ── FOOTER REDESIGN ── */')
        end_idx = content.find('</style>', start_idx)
        # We want to keep anything that isn't the footer styles. 
        # But in these files, the footer styles were at the end of the style tag.
        # Actually, let's just replace the whole block from /* ── FOOTER REDESIGN ── */ to just before </style>
        # (Assuming nothing else was there)
        new_content = content[:start_idx] + css_replacement + content[end_idx:]
        content = new_content

    # Replace HTML
    if html_target_start in content:
        start_idx = content.find(html_target_start)
        end_idx = content.find(html_target_end, start_idx) + len(html_target_end)
        new_content = content[:start_idx] + html_replacement + content[end_idx:]
        content = new_content
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
    print(f"Fixed {f}")
