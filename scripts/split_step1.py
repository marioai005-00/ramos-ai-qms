import os
import re

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'
os.makedirs(os.path.join(base_dir, 'css'), exist_ok=True)
os.makedirs(os.path.join(base_dir, 'js'), exist_ok=True)
os.makedirs(os.path.join(base_dir, 'js', 'views'), exist_ok=True)

with open(os.path.join(base_dir, 'index.html'), 'r', encoding='utf-8') as f:
    full_html = f.read()

# 1. Extract CSS
style_match = re.search(r'<style>(.*?)</style>', full_html, re.DOTALL)
if style_match:
    css_content = style_match.group(1).strip()
    with open(os.path.join(base_dir, 'css', 'styles.css'), 'w', encoding='utf-8') as f:
        f.write(css_content)
    print('Created css/styles.css')

# 2. Extract HTML Body skeleton
head_before_style = full_html[:full_html.find('<style>')]
body_between = full_html[full_html.find('</style>')+8:full_html.find('<script>')]

new_index_html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RAMOS AI-Based 8D Quality Problem Solving Platform</title>

  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <!-- Chart.js for Visual Watchtowers -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <!-- Modular Portal Stylesheet -->
  <link rel="stylesheet" href="css/styles.css">
</head>
{body_between.strip()}

  <!-- Modular JavaScript Engine -->
  <script src="js/data.js"></script>
  <script src="js/org_tree.js"></script>
  <script src="js/views/dashboard.js"></script>
  <script src="js/views/intake.js"></script>
  <script src="js/views/workspace.js"></script>
  <script src="js/views/evidence.js"></script>
  <script src="js/views/actions.js"></script>
  <script src="js/views/reports.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
"""

with open(os.path.join(base_dir, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(new_index_html)
print('Updated index.html to lightweight modular skeleton!')
