/* ========================================================================= */
/* SEMICONDUCTOR EMPIRICAL EVIDENCE & RELIABILITY SVG CHARTS MODULE         */
/* 1. SEM Micrograph Cross-Section (열충격 크랙/IMC 계면 파괴)               */
/* 2. 3D X-Ray Non-Destructive Inspection (BGA 보이드 및 숏트 경로)         */
/* 3. Cpk Gaussian Normal Distribution (Pre-PCA 0.82 -> Post-PCA 1.84)        */
/* 4. TC1000h Thermal Cycle Weibull/Survival Curve (1000h 무결점 입증)      */
/* ========================================================================= */

window.SemiconductorEvidence = (function() {

  function renderSemMicrographSvg(options = {}) {
    const width = options.width || '100%';
    const height = options.height || 220;
    return `
      <div class="evidence-chart-card">
        <div class="evidence-chart-header">
          <div class="chart-meta-left">
            <span class="evidence-badge sem-badge">SEM MICROGRAPH</span>
            <span class="evidence-title">전자현미경(SEM) 단면 분석: BGA 패드 계면 열충격 박리 크랙</span>
          </div>
          <div class="chart-meta-right">
            <span class="chart-spec-tag">HV: 15.0 kV</span>
            <span class="chart-spec-tag">MAG: x2,500</span>
            <span class="chart-spec-tag">DET: BSE (고배율 역산란)</span>
          </div>
        </div>
        <div class="evidence-svg-wrapper">
          <svg viewBox="0 0 600 200" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" class="sem-svg" style="background:#090d16; border-radius:6px; display:block;">
            <defs>
              <linearGradient id="semSubstrateGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#1e293b"/>
                <stop offset="100%" stop-color="#0f172a"/>
              </linearGradient>
              <linearGradient id="semEmcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#334155"/>
                <stop offset="100%" stop-color="#1e293b"/>
              </linearGradient>
              <linearGradient id="semSolderGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#64748b"/>
                <stop offset="50%" stop-color="#94a3b8"/>
                <stop offset="100%" stop-color="#475569"/>
              </linearGradient>
              <linearGradient id="semCuPadGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#b45309"/>
                <stop offset="50%" stop-color="#d97706"/>
                <stop offset="100%" stop-color="#92400e"/>
              </linearGradient>
            </defs>

            <rect width="600" height="200" fill="#090d16"/>
            <g stroke="#1e293b" stroke-width="0.5" stroke-opacity="0.4">
              <line x1="0" y1="40" x2="600" y2="40"/>
              <line x1="0" y1="80" x2="600" y2="80"/>
              <line x1="0" y1="120" x2="600" y2="120"/>
              <line x1="0" y1="160" x2="600" y2="160"/>
              <line x1="150" y1="0" x2="150" y2="200"/>
              <line x1="300" y1="0" x2="300" y2="200"/>
              <line x1="450" y1="0" x2="450" y2="200"/>
            </g>

            <rect x="50" y="20" width="500" height="36" fill="url(#semSubstrateGrad)" stroke="#475569" stroke-width="1"/>
            <text x="60" y="42" fill="#94a3b8" font-size="11" font-weight="700" font-family="monospace">SILICON DIE (16GB BGA Core)</text>

            <rect x="50" y="56" width="500" height="30" fill="url(#semEmcGrad)" stroke="#334155" stroke-width="1"/>
            <text x="60" y="75" fill="#cbd5e1" font-size="10" font-family="sans-serif">EMC Epoxy Molding Compound (CTE: 14 ppm/℃)</text>

            <rect x="180" y="146" width="240" height="18" fill="url(#semCuPadGrad)" stroke="#f59e0b" stroke-width="1"/>
            <text x="190" y="159" fill="#fef3c7" font-size="10" font-weight="700" font-family="sans-serif">Cu Substrate Pad (PCB Land)</text>

            <rect x="200" y="138" width="200" height="8" fill="#a1a1aa" stroke="#71717a" stroke-width="0.8"/>
            <text x="410" y="144" fill="#a1a1aa" font-size="9" font-family="monospace">IMC Layer (Cu6Sn5 ~2.8µm)</text>
            <line x1="402" y1="142" x2="380" y2="142" stroke="#a1a1aa" stroke-width="0.8"/>

            <path d="M 180,86 C 180,138 200,138 200,138 L 400,138 C 400,138 420,138 420,86 Z" fill="url(#semSolderGrad)" stroke="#64748b" stroke-width="1"/>
            <text x="255" y="112" fill="#0f172a" font-size="11" font-weight="800" font-family="sans-serif">SAC305 Solder Joint</text>

            <path d="M 196,138 Q 240,134 290,137 T 370,136" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="4,2"/>
            <circle cx="196" cy="138" r="4" fill="#ef4444"/>
            <circle cx="370" cy="136" r="3" fill="#ef4444"/>

            <line x1="280" y1="137" x2="280" y2="182" stroke="#ef4444" stroke-width="1.2"/>
            <circle cx="280" cy="137" r="3" fill="#ef4444"/>
            <rect x="150" y="174" width="270" height="20" rx="3" fill="#991b1b" fill-opacity="0.9" stroke="#f87171" stroke-width="1"/>
            <text x="160" y="188" fill="#ffffff" font-size="9.5" font-weight="700" font-family="sans-serif">
              ⚡ 파단부: 열응력 미세 크랙 진전 (IMC 취성 박리)
            </text>

            <g transform="translate(480, 175)">
              <line x1="0" y1="10" x2="80" y2="10" stroke="#ffffff" stroke-width="3"/>
              <line x1="0" y1="5" x2="0" y2="15" stroke="#ffffff" stroke-width="2"/>
              <line x1="80" y1="5" x2="80" y2="15" stroke="#ffffff" stroke-width="2"/>
              <text x="25" y="4" fill="#ffffff" font-size="9" font-family="monospace" font-weight="bold">10 µm</text>
            </g>
          </svg>
        </div>
        <div class="evidence-chart-footer">
          <span><b>진단 소견:</b> 리플로우 262℃ 과열에 따른 솔더/패드 열팽창계수 불일치로 IMC 경계면에 전단응력 집중 파괴 발생.</span>
          <span class="evidence-status-crit">FA 실측 확정 (EVD-FA-01)</span>
        </div>
      </div>
    `;
  }

  function renderXRayRadiographSvg(options = {}) {
    const width = options.width || '100%';
    const height = options.height || 220;
    return `
      <div class="evidence-chart-card">
        <div class="evidence-chart-header">
          <div class="chart-meta-left">
            <span class="evidence-badge xray-badge">3D X-RAY RADIOGRAPH</span>
            <span class="evidence-title">비파괴 3D 투시 검사: BGA Ball Grid 보이드(Void) 및 솔더 브릿지</span>
          </div>
          <div class="chart-meta-right">
            <span class="chart-spec-tag">TUBE: 130 kV / 120 µA</span>
            <span class="chart-spec-tag">RES: 0.8 µm</span>
            <span class="chart-spec-tag">ANGLE: 45° Oblique Tilt</span>
          </div>
        </div>
        <div class="evidence-svg-wrapper">
          <svg viewBox="0 0 600 200" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" class="xray-svg" style="background:#040711; border-radius:6px; display:block;">
            <rect width="600" height="200" fill="#030712"/>

            <g stroke="#1e293b" stroke-width="0.5" stroke-dasharray="2,4" stroke-opacity="0.6">
              <circle cx="300" cy="100" r="40" fill="none"/>
              <circle cx="300" cy="100" r="80" fill="none"/>
              <line x1="50" y1="100" x2="550" y2="100"/>
              <line x1="300" y1="20" x2="300" y2="180"/>
            </g>

            <text x="30" y="24" fill="#64748b" font-size="10" font-family="monospace">AXIS: [X: +14.282 mm, Y: -08.412 mm, Z: 0.850 mm]</text>

            <g>
              <!-- Row 1 -->
              <circle cx="110" cy="55" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="110" y="58" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">E5</text>
              <circle cx="180" cy="55" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="180" y="58" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">E6</text>
              <circle cx="250" cy="55" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="250" y="58" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">E7</text>
              <circle cx="320" cy="55" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="320" y="58" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">E8</text>
              <circle cx="390" cy="55" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="390" y="58" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">E9</text>
              <circle cx="460" cy="55" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="460" y="58" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">E10</text>

              <!-- Row 2 -->
              <circle cx="110" cy="115" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="110" y="118" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">F5</text>
              <circle cx="180" cy="115" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="180" y="118" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">F6</text>

              <!-- Bridge between F7 and F8 -->
              <rect x="250" y="107" width="70" height="16" fill="#38bdf8" fill-opacity="0.7" rx="6"/>

              <!-- F7 Defect Ball with Void -->
              <circle cx="250" cy="115" r="24" fill="#64748b" fill-opacity="0.8" stroke="#ef4444" stroke-width="2"/>
              <circle cx="252" cy="113" r="15" fill="#0f172a" stroke="#f87171" stroke-width="1.5" stroke-dasharray="3,1"/>
              <circle cx="252" cy="113" r="6" fill="#000000"/>
              <text x="250" y="111" fill="#ef4444" font-size="10" font-weight="900" text-anchor="middle" font-family="monospace">VOID</text>
              <text x="250" y="123" fill="#fca5a5" font-size="8.5" font-weight="700" text-anchor="middle" font-family="sans-serif">38.4%</text>

              <!-- F8 Ball -->
              <circle cx="320" cy="115" r="24" fill="#475569" fill-opacity="0.85" stroke="#38bdf8" stroke-width="1.5"/>
              <text x="320" y="119" fill="#e2e8f0" font-size="9" text-anchor="middle" font-family="monospace">F8</text>

              <circle cx="390" cy="115" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="390" y="118" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">F9</text>
              <circle cx="460" cy="115" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="460" y="118" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">F10</text>

              <!-- Row 3 -->
              <circle cx="110" cy="170" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="110" y="173" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">G5</text>
              <circle cx="180" cy="170" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="180" y="173" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">G6</text>
              <circle cx="250" cy="170" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="250" y="173" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">G7</text>
              <circle cx="320" cy="170" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="320" y="173" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">G8</text>
              <circle cx="390" cy="170" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="390" y="173" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">G9</text>
              <circle cx="460" cy="170" r="24" fill="#334155" fill-opacity="0.75" stroke="#475569" stroke-width="0.8"/><text x="460" y="173" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="monospace">G10</text>
            </g>

            <rect x="220" y="85" width="130" height="60" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,2"/>
            <text x="222" y="80" fill="#f59e0b" font-size="9" font-weight="700">IPC-A-610G 불량: Void 38.4% (>25%) & Bridge</text>

            <g transform="translate(480, 20)">
              <rect width="105" height="24" rx="4" fill="#450a0a" stroke="#ef4444" stroke-width="1"/>
              <text x="52" y="16" fill="#fca5a5" font-size="9.5" font-weight="800" text-anchor="middle">VOID NG (38.4%)</text>
            </g>
          </svg>
        </div>
        <div class="evidence-chart-footer">
          <span><b>판정 기준:</b> IPC-A-610 Class 3 허용치(보이드 면적 25% 이하). 실측 38.4% 및 인접 F8 Ball과 솔더 브릿지 형성.</span>
          <span class="evidence-status-crit">VCC-VSS 쇼트 메커니즘 규명</span>
        </div>
      </div>
    `;
  }

  function renderCpkDistributionSvg(options = {}) {
    const width = options.width || '100%';
    const height = options.height || 230;
    return `
      <div class="evidence-chart-card">
        <div class="evidence-chart-header">
          <div class="chart-meta-left">
            <span class="evidence-badge cpk-badge">SPC PROCESS CAPABILITY</span>
            <span class="evidence-title">공정능력지수(Cpk) 비교: 리플로우 피크 온도 (Before vs After PCA)</span>
          </div>
          <div class="chart-meta-right">
            <span class="chart-spec-tag">LSL: 240.0℃</span>
            <span class="chart-spec-tag">TARGET: 250.0℃</span>
            <span class="chart-spec-tag">USL: 260.0℃</span>
          </div>
        </div>
        <div class="evidence-svg-wrapper">
          <svg viewBox="0 0 600 210" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" class="cpk-svg" style="background:var(--bg-card-subtle); border-radius:6px; display:block;">
            <defs>
              <linearGradient id="prePcaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ef4444" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#ef4444" stop-opacity="0.02"/>
              </linearGradient>
              <linearGradient id="postPcaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.45"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.02"/>
              </linearGradient>
            </defs>

            <line x1="50" y1="170" x2="560" y2="170" stroke="var(--border)" stroke-width="1.5"/>

            <line x1="120" y1="25" x2="120" y2="170" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3"/>
            <text x="120" y="20" fill="#f59e0b" font-size="9" font-weight="700" text-anchor="middle">LSL 240℃</text>

            <line x1="300" y1="25" x2="300" y2="170" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2,2"/>
            <text x="300" y="20" fill="#94a3b8" font-size="9" font-weight="700" text-anchor="middle">TARGET 250℃</text>

            <line x1="480" y1="25" x2="480" y2="170" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3"/>
            <text x="480" y="20" fill="#f59e0b" font-size="9" font-weight="700" text-anchor="middle">USL 260℃</text>

            <path d="M 120,170 Q 300,165 400,140 T 495,70 T 540,145 T 570,170 Z" fill="url(#prePcaFill)"/>
            <path d="M 120,170 Q 300,165 400,140 T 495,70 T 540,145 T 570,170" fill="none" stroke="#ef4444" stroke-width="2"/>
            <circle cx="495" cy="70" r="3.5" fill="#ef4444"/>

            <path d="M 180,170 Q 240,165 260,110 T 300,38 T 340,110 T 420,170 Z" fill="url(#postPcaFill)"/>
            <path d="M 180,170 Q 240,165 260,110 T 300,38 T 340,110 T 420,170" fill="none" stroke="#10b981" stroke-width="2.5"/>
            <circle cx="300" cy="38" r="4" fill="#10b981"/>

            <g transform="translate(390, 85)">
              <rect width="170" height="42" rx="4" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" stroke-width="1"/>
              <text x="8" y="16" fill="#f87171" font-size="9" font-weight="700">■ Before PCA (개선 전)</text>
              <text x="8" y="32" fill="#ef4444" font-size="10.5" font-weight="900" font-family="monospace">Cpk: 0.82 (공정 불량)</text>
            </g>

            <g transform="translate(70, 70)">
              <rect width="170" height="42" rx="4" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" stroke-width="1"/>
              <text x="8" y="16" fill="#34d399" font-size="9" font-weight="700">■ After PCA (KIC 프로파일러 도입)</text>
              <text x="8" y="32" fill="#10b981" font-size="10.5" font-weight="900" font-family="monospace">Cpk: 1.84 (공정 안정)</text>
            </g>

            <text x="120" y="185" fill="var(--text-muted)" font-size="9" text-anchor="middle">240℃</text>
            <text x="210" y="185" fill="var(--text-muted)" font-size="9" text-anchor="middle">245℃</text>
            <text x="300" y="185" fill="var(--text-muted)" font-size="9" text-anchor="middle">250℃</text>
            <text x="390" y="185" fill="var(--text-muted)" font-size="9" text-anchor="middle">255℃</text>
            <text x="480" y="185" fill="var(--text-muted)" font-size="9" text-anchor="middle">260℃</text>
          </svg>
        </div>
        <div class="evidence-chart-footer">
          <span><b>개선 성과:</b> KIC 실시간 프로파일러 및 자동 인터락 적용 후 편차(σ) 3.8℃ -> 0.9℃ 축소. Cpk 1.84 달성.</span>
          <span class="evidence-status-ok">IATF 16949 기준 (1.67) 초과 달성</span>
        </div>
      </div>
    `;
  }

  function renderTC1000hSurvivalSvg(options = {}) {
    const width = options.width || '100%';
    const height = options.height || 230;
    return `
      <div class="evidence-chart-card">
        <div class="evidence-chart-header">
          <div class="chart-meta-left">
            <span class="evidence-badge rel-badge">JEDEC JESD22-A104 RELIABILITY</span>
            <span class="evidence-title">가속열충격(TC1000h) 신뢰성 누적 생존율: -40℃ ~ +125℃</span>
          </div>
          <div class="chart-meta-right">
            <span class="chart-spec-tag">SAMPLE: 3,000ea</span>
            <span class="chart-spec-tag">CYCLE: 1,000 Cycles</span>
            <span class="chart-spec-tag">CONFIDENCE: 95%</span>
          </div>
        </div>
        <div class="evidence-svg-wrapper">
          <svg viewBox="0 0 600 210" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" class="tc-svg" style="background:var(--bg-card-subtle); border-radius:6px; display:block;">
            <g stroke="var(--border)" stroke-width="0.7" stroke-dasharray="2,3" stroke-opacity="0.7">
              <line x1="60" y1="40" x2="560" y2="40"/>
              <line x1="60" y1="75" x2="560" y2="75"/>
              <line x1="60" y1="110" x2="560" y2="110"/>
              <line x1="60" y1="145" x2="560" y2="145"/>
              <line x1="60" y1="175" x2="560" y2="175"/>

              <line x1="60" y1="40" x2="60" y2="175"/>
              <line x1="185" y1="40" x2="185" y2="175"/>
              <line x1="310" y1="40" x2="310" y2="175"/>
              <line x1="435" y1="40" x2="435" y2="175"/>
              <line x1="560" y1="40" x2="560" y2="175"/>
            </g>

            <text x="50" y="44" fill="var(--text-muted)" font-size="8.5" text-anchor="end">100%</text>
            <text x="50" y="79" fill="var(--text-muted)" font-size="8.5" text-anchor="end">99%</text>
            <text x="50" y="114" fill="var(--text-muted)" font-size="8.5" text-anchor="end">98%</text>
            <text x="50" y="149" fill="var(--text-muted)" font-size="8.5" text-anchor="end">97%</text>
            <text x="50" y="179" fill="var(--text-muted)" font-size="8.5" text-anchor="end">96%</text>

            <text x="60" y="193" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">0h</text>
            <text x="185" y="193" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">250h</text>
            <text x="310" y="193" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">500h</text>
            <text x="435" y="193" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">750h</text>
            <text x="560" y="193" fill="var(--text-muted)" font-size="8.5" text-anchor="middle">1,000h</text>

            <path d="M 60,40 L 260,40 Q 350,60 420,120 T 560,175" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,2"/>
            <circle cx="560" cy="175" r="4" fill="#ef4444"/>

            <path d="M 60,40 L 560,40" fill="none" stroke="#10b981" stroke-width="3"/>
            <circle cx="60" cy="40" r="4" fill="#10b981"/>
            <circle cx="185" cy="40" r="4" fill="#10b981"/>
            <circle cx="310" cy="40" r="4" fill="#10b981"/>
            <circle cx="435" cy="40" r="4" fill="#10b981"/>
            <circle cx="560" cy="40" r="5" fill="#10b981"/>

            <g transform="translate(180, 15)">
              <rect width="240" height="20" rx="3" fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" stroke-width="1"/>
              <text x="120" y="14" fill="#10b981" font-size="9" font-weight="800" text-anchor="middle">
                ★ Post-PCA: 1,000 Cycle 100.0% 생존 (3,000/3,000ea 무결점)
              </text>
            </g>

            <g transform="translate(370, 130)">
              <rect width="180" height="34" rx="3" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" stroke-width="1"/>
              <text x="8" y="14" fill="#f87171" font-size="8.5" font-weight="700">개선 전 (Baseline):</text>
              <text x="8" y="27" fill="#ef4444" font-size="9" font-weight="900">450h 이후 12ea 솔더 파단</text>
            </g>
          </svg>
        </div>
        <div class="evidence-chart-footer">
          <span><b>검증 결과:</b> 양산 3,000ea 투입 가속열충격 1,000 Cycle 완료 후 VCC-VSS 저항치 전수 측정 이상 전무.</span>
          <span class="evidence-status-ok">D6 최종 효과 유효성 100% 입증</span>
        </div>
      </div>
    `;
  }

  return {
    renderSemMicrographSvg,
    renderXRayRadiographSvg,
    renderCpkDistributionSvg,
    renderTC1000hSurvivalSvg
  };
})();
