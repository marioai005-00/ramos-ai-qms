import json

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\input\org_exact_tree.json', encoding='utf-8') as f:
    tree = json.load(f)

def get_all_members(nodes):
    m_list = []
    for n in nodes:
        for m in n.get('members', []):
            m_list.append(m)
        if 'children' in n:
            m_list.extend(get_all_members(n['children']))
    return m_list

all_m = get_all_members(tree)
leaders = [m for m in all_m if any(k in m['position'] for k in ['팀장', '그룹장', '실장', '센터장', '담당', '부문장', '상무', '전무', '부사장', '대표이사', '이사'])]

print('Total members:', len(all_m))
print('Leaders count:', len(leaders))
for l in leaders:
    print(f"[{l['dept']}] {l['name']} ({l['position']}) - {l['email']}")
