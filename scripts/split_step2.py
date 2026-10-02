import os
import re

base_dir = r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System'

# We can read original full script from a backup or previous transcript or we have the full text
# Let's inspect the sections in the script
with open(os.path.join(base_dir, 'index.html'), 'r', encoding='utf-8') as f:
    text = f.read()

# Let's write the dedicated modular JS files
