import codecs

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update sidebar org card in renderOrgTree
old_sidebar_card = """                    ${(q ? filteredMembers : node.members).map(m => `
                      <div class="org-user-card ${m.isMe ? 'is-me' : ''}">
                        <div class="org-avatar ${m.isMe ? 'me' : ''}">
                          ${m.name.length > 2 ? m.name.slice(-2) : m.name}
                        </div>
                        <div style="flex:1; min-width:0;">
                          <div style="display:flex; align-items:center; gap:5px;">
                            <span style="font-size:0.8rem; font-weight:700; color:#f8fafc;">${m.name}</span>
                            <span style="font-size:0.68rem; color:#94a3b8;">${m.position || 'Pro'}</span>
                            ${m.isMe ? `<span class="badge-me">나</span>` : ''}
                            <span style="margin-left:auto; font-size:0.62rem; color:#34d399;">● Online</span>
                          </div>
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px;">
                            <span class="num-mono" style="font-size:0.65rem; color:#64748b;">${m.email}</span>
                            <button class="btn btn-secondary btn-sm" style="padding:1px 6px; font-size:0.65rem;" onclick="event.stopPropagation(); assignOrgMemberToCFT('${m.name}', '${m.position}', '${node.name}', '${m.email}')" title="현재 Case의 D1 CFT 팀에 배정">
                              <i data-lucide="user-plus" style="width:10px; height:10px; color:#38bdf8;"></i> CFT
                            </button>
                          </div>
                        </div>
                      </div>
                    `).join('')}"""

new_sidebar_card = """                    ${(q ? filteredMembers : node.members).map(m => `
                      <div class="org-user-card ${m.isMe ? 'is-me' : ''}">
                        <div class="org-avatar ${m.isMe ? 'me' : ''}">
                          ${m.name.length > 2 ? m.name.slice(-2) : m.name}
                        </div>
                        <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
                          <div style="font-size:0.82rem; font-weight:700; color:#f8fafc; line-height:1.2;">
                            ${m.name} ${m.isMe ? `<span class="badge-me" style="font-size:0.6rem; padding:0 4px; border-radius:3px;">나</span>` : ''}
                          </div>
                          <div style="font-size:0.72rem; color:#94a3b8; line-height:1.2;">
                            ${m.position || 'Pro'}
                          </div>
                          <div class="num-mono" style="font-size:0.68rem; color:#60a5fa; line-height:1.2; word-break:break-all;">
                            ${m.email}
                          </div>
                        </div>
                      </div>
                    `).join('')}"""

if old_sidebar_card in content:
    content = content.replace(old_sidebar_card, new_sidebar_card, 1)
    print('Updated sidebar org tree member cards to clean 3-line format!')
else:
    print('Could not find old_sidebar_card')

# 2. Update modal org tree member card in renderModalOrgTree
old_modal_card = """                    ${filteredMembers.map(m => `
                      <div class="tree-member-card" style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:#0e172a; border:1px solid rgba(255,255,255,0.06); border-radius:5px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <div style="width:26px; height:26px; border-radius:50%; background:linear-gradient(135deg,#2563eb,#7c3aed); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.7rem; color:#fff;">
                            ${m.name.slice(0, 2)}
                          </div>
                          <div>
                            <div style="display:flex; align-items:center; gap:6px;">
                              <span style="font-size:0.8rem; font-weight:700; color:#f8fafc;">${m.name}</span>
                              <span style="font-size:0.68rem; color:#94a3b8;">${m.position || 'Pro'}</span>
                              ${m.isMe ? `<span class="badge-me" style="font-size:0.6rem; background:#2563eb; color:#fff; padding:0 4px; border-radius:3px;">나</span>` : ''}
                              <span style="font-size:0.62rem; color:#34d399;">● Online</span>
                            </div>
                            <div class="num-mono" style="font-size:0.65rem; color:#64748b;">${m.email}</div>
                          </div>
                        </div>
                        <button type="button" class="btn btn-primary btn-sm" style="padding:3px 10px; font-size:0.72rem;" onclick="assignModalMemberToCFT('${m.name}', '${m.position || 'Pro'}', '${node.name}', '${m.email}')">
                          <i data-lucide="user-plus" style="width:11px; height:11px;"></i> 배속 추가
                        </button>
                      </div>
                    `).join('')}"""

new_modal_card = """                    ${filteredMembers.map(m => `
                      <div class="tree-member-card" style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:#0e172a; border:1px solid rgba(255,255,255,0.06); border-radius:5px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                          <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#2563eb,#7c3aed); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.7rem; color:#fff; flex-shrink:0;">
                            ${m.name.length > 2 ? m.name.slice(-2) : m.name}
                          </div>
                          <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="font-size:0.82rem; font-weight:700; color:#f8fafc; line-height:1.2;">
                              ${m.name} ${m.isMe ? `<span class="badge-me" style="font-size:0.6rem; background:#2563eb; color:#fff; padding:0 4px; border-radius:3px;">나</span>` : ''}
                            </div>
                            <div style="font-size:0.72rem; color:#94a3b8; line-height:1.2;">
                              ${m.position || 'Pro'}
                            </div>
                            <div class="num-mono" style="font-size:0.68rem; color:#60a5fa; line-height:1.2; word-break:break-all;">
                              ${m.email}
                            </div>
                          </div>
                        </div>
                        <button type="button" class="btn btn-primary btn-sm" style="padding:4px 12px; font-size:0.74rem;" onclick="assignModalMemberToCFT('${m.name}', '${m.position || 'Pro'}', '${node.name}', '${m.email}')">
                          <i data-lucide="user-plus" style="width:12px; height:12px;"></i> 배속 추가
                        </button>
                      </div>
                    `).join('')}"""

if old_modal_card in content:
    content = content.replace(old_modal_card, new_modal_card, 1)
    print('Updated modal org tree member cards to clean 3-line format!')
else:
    print('Could not find old_modal_card')

with open(r'g:\내 드라이브\AI_Place\Work\11_AI_Customer_Nonconformance_8D_System\index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved clean index.html successfully!')
