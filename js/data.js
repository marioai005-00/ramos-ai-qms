/* ========================================================================= */
    /* MASTER DATA STORE & BENCHMARK CASES (PHILOSOPHY ALIGNED)                   */
    /* ========================================================================= */
    // User workspace starts empty; company master data is preserved separately.
    const STORAGE_KEY = 'AI_QMS_8D_DATA_V10_USER_WORKSPACE';
    const STORAGE_TAB_KEY = 'RAMOS_QMS_STORAGE_TAB_ID';
    const STORAGE_TAB_ID = (() => {
      try {
        const existing = sessionStorage.getItem(STORAGE_TAB_KEY);
        if (existing) return existing;
        const created = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        sessionStorage.setItem(STORAGE_TAB_KEY, created);
        return created;
      } catch (_) {
        return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
    })();
    let externalStorageRevision = 0;

    const INITIAL_CASES = [];

    // RAmos Exact Hierarchical Organization Tree (Matching User Folder Sequence)
    const RAMOS_TREE = [
      {
            "id": "ceo",
            "name": "대표이사",
            "type": "dept",
            "members": [
                  {
                        "name": "조장호",
                        "position": "대표이사",
                        "email": "jh.choue66@ramostek.com",
                        "dept": "대표이사",
                        "isMe": false
                  }
            ]
      },
      {
            "id": "coo",
            "name": "COO 직속",
            "type": "dept",
            "members": [
                  {
                        "name": "윤석재",
                        "position": "COO_부사장",
                        "email": "sjyun@ramostek.com",
                        "dept": "COO 직속",
                        "isMe": false
                  }
            ],
            "children": [
                  {
                        "id": "mfg_center",
                        "name": "제조기획센터",
                        "type": "center",
                        "members": [
                              {
                                    "name": "이은산",
                                    "position": "센터장_상무",
                                    "email": "eunsan.lee@ramostek.com",
                                    "dept": "제조기획센터",
                                    "isMe": false
                              }
                        ],
                        "children": [
                              {
                                    "id": "goc",
                                    "name": "GOC팀",
                                    "type": "team",
                                    "members": [],
                                    "children": [
                                          {
                                                "id": "plan_grp",
                                                "name": "계획운영그룹",
                                                "type": "group",
                                                "members": [
                                                      {
                                                            "name": "공아름",
                                                            "position": "그룹장_P.Pro",
                                                            "email": "loveskr@ramostek.com",
                                                            "dept": "계획운영그룹",
                                                            "isMe": false
                                                      },
                                                      {
                                                            "name": "강순자",
                                                            "position": "Senior Pro",
                                                            "email": "daks3539@ramostek.com",
                                                            "dept": "계획운영그룹",
                                                            "isMe": false
                                                      },
                                                      {
                                                            "name": "김현수_제조",
                                                            "position": "Pro",
                                                            "email": "kimhs@ramostek.com",
                                                            "dept": "계획운영그룹",
                                                            "isMe": false
                                                      }
                                                ]
                                          },
                                          {
                                                "id": "res_grp",
                                                "name": "자원운영그룹",
                                                "type": "group",
                                                "members": [
                                                      {
                                                            "name": "조철민",
                                                            "position": "그룹장_P.Pro",
                                                            "email": "nrjcm@ramostek.com",
                                                            "dept": "자원운영그룹",
                                                            "isMe": false
                                                      },
                                                      {
                                                            "name": "우정우",
                                                            "position": "Pro",
                                                            "email": "jwwoo@ramostek.com",
                                                            "dept": "자원운영그룹",
                                                            "isMe": false
                                                      }
                                                ]
                                          },
                                          {
                                                "id": "sub_grp",
                                                "name": "외주운영그룹",
                                                "type": "group",
                                                "members": [
                                                      {
                                                            "name": "김혜원",
                                                            "position": "Pro",
                                                            "email": "hyewon@ramostek.com",
                                                            "dept": "외주운영그룹",
                                                            "isMe": false
                                                      },
                                                      {
                                                            "name": "오승현",
                                                            "position": "Pro",
                                                            "email": "shoh@ramostek.com",
                                                            "dept": "외주운영그룹",
                                                            "isMe": false
                                                      }
                                                ]
                                          }
                                    ]
                              },
                              {
                                    "id": "it_sec",
                                    "name": "IT_보안팀",
                                    "type": "team",
                                    "members": [
                                          {
                                                "name": "이우진",
                                                "position": "팀장_P.Pro",
                                                "email": "lwj@ramostek.com",
                                                "dept": "IT_보안팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "김기서",
                                                "position": "Pro",
                                                "email": "kskim@ramostek.com",
                                                "dept": "IT_보안팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "김도현",
                                                "position": "Pro",
                                                "email": "dohyun20.kim@ramostek.com",
                                                "dept": "IT_보안팀",
                                                "isMe": false
                                          }
                                    ]
                              }
                        ]
                  }
            ]
      },
      {
            "id": "strat_mkt",
            "name": "전략 마케팅실",
            "type": "dept",
            "members": [
                  {
                        "name": "손동우",
                        "position": "실장_부사장",
                        "email": "bigsohn@ramostek.com",
                        "dept": "전략 마케팅실",
                        "isMe": false
                  }
            ],
            "children": [
                  {
                        "id": "sales_div",
                        "name": "영업부문",
                        "type": "division",
                        "members": [
                              {
                                    "name": "Robin_Myung_명노광",
                                    "position": "부문장_전무",
                                    "email": "rkmyung@ramostek.com",
                                    "dept": "영업부문",
                                    "isMe": false
                              }
                        ],
                        "children": [
                              {
                                    "id": "sales_team",
                                    "name": "영업팀",
                                    "type": "team",
                                    "members": [
                                          {
                                                "name": "Sahong_Kim_김사홍",
                                                "position": "팀장_P.Pro",
                                                "email": "shk@ramostek.com",
                                                "dept": "영업팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "Aria_김애정",
                                                "position": "Pro",
                                                "email": "anasta@ramostek.com",
                                                "dept": "영업팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "Jinyi Ahn_안진의",
                                                "position": "Pro",
                                                "email": "jinyi711@ramostek.com",
                                                "dept": "영업팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "Jun Lee_이학준",
                                                "position": "Pro",
                                                "email": "junlee@ramostek.com",
                                                "dept": "영업팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "Martin Lee_이지훈",
                                                "position": "Pro",
                                                "email": "homebot@ramostek.com",
                                                "dept": "영업팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "Roen Kim_김려은",
                                                "position": "Pro",
                                                "email": "roenkim@ramostek.com",
                                                "dept": "영업팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "Selly Park_박소진",
                                                "position": "Pro",
                                                "email": "sjpark@ramostek.com",
                                                "dept": "영업팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "빈철우_Benjamin",
                                                "position": "Pro",
                                                "email": "cwbeen@ramostek.com",
                                                "dept": "영업팀",
                                                "isMe": false
                                          }
                                    ]
                              }
                        ]
                  },
                  {
                        "id": "sourcing_team",
                        "name": "전략소싱팀",
                        "type": "team",
                        "members": [
                              {
                                    "name": "John_Woo_우준수",
                                    "position": "팀장_이사",
                                    "email": "johnwoo@ramostek.com",
                                    "dept": "전략소싱팀",
                                    "isMe": false
                              },
                              {
                                    "name": "강병주",
                                    "position": "Pro",
                                    "email": "kbj8420@ramostek.com",
                                    "dept": "전략소싱팀",
                                    "isMe": false
                              },
                              {
                                    "name": "남서현",
                                    "position": "Pro",
                                    "email": "shnam1228@ramostek.com",
                                    "dept": "전략소싱팀",
                                    "isMe": false
                              },
                              {
                                    "name": "이하영",
                                    "position": "Pro",
                                    "email": "lhyduddlgk@ramostek.com",
                                    "dept": "전략소싱팀",
                                    "isMe": false
                              }
                        ]
                  },
                  {
                        "id": "qi_team",
                        "name": "품질혁신팀",
                        "type": "team",
                        "members": [
                              {
                                    "name": "황승안",
                                    "position": "팀장_상무",
                                    "email": "sahwang@ramostek.com",
                                    "dept": "품질혁신팀",
                                    "isMe": false
                              },
                              {
                                    "name": "김성중",
                                    "position": "Senior Pro",
                                    "email": "sjkim@ramostek.com",
                                    "dept": "품질혁신팀",
                                    "isMe": true
                              },
                              {
                                    "name": "이봉건",
                                    "position": "Pro",
                                    "email": "special2947@ramostek.com",
                                    "dept": "품질혁신팀",
                                    "isMe": false
                              }
                        ]
                  }
            ]
      },
      {
            "id": "rnd",
            "name": "알앤디부문",
            "type": "dept",
            "members": [
                  {
                        "name": "박정훈",
                        "position": "부문장_전무",
                        "email": "gh8229@ramostek.com",
                        "dept": "알앤디부문",
                        "isMe": false
                  }
            ],
            "children": [
                  {
                        "id": "dram_div",
                        "name": "DRAM 개발실",
                        "type": "center",
                        "members": [
                              {
                                    "name": "박철홍",
                                    "position": "실장_상무",
                                    "email": "chpark@ramostek.com",
                                    "dept": "DRAM 개발실",
                                    "isMe": false
                              },
                              {
                                    "name": "이민호",
                                    "position": "담당_팀장_이사",
                                    "email": "aden@ramostek.com",
                                    "dept": "DRAM 개발실",
                                    "isMe": false
                              }
                        ],
                        "children": [
                              {
                                    "id": "dram_1",
                                    "name": "DRAM 개발1팀",
                                    "type": "team",
                                    "members": [
                                          {
                                                "name": "박재훈",
                                                "position": "Principal Pro",
                                                "email": "hope@ramostek.com",
                                                "dept": "DRAM 개발1팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "배진성",
                                                "position": "Principal Pro",
                                                "email": "sean@ramostek.com",
                                                "dept": "DRAM 개발1팀",
                                                "isMe": false
                                          }
                                    ]
                              },
                              {
                                    "id": "dram_2",
                                    "name": "DRAM 개발2팀",
                                    "type": "team",
                                    "members": [
                                          {
                                                "name": "신덕용",
                                                "position": "팀장_P.Pro",
                                                "email": "satiou@ramostek.com",
                                                "dept": "DRAM 개발2팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "정선혁",
                                                "position": "Pro",
                                                "email": "jsh@ramostek.com",
                                                "dept": "DRAM 개발2팀",
                                                "isMe": false
                                          }
                                    ]
                              }
                        ]
                  },
                  {
                        "id": "flash_div",
                        "name": "Flash 개발실",
                        "type": "center",
                        "members": [
                              {
                                    "name": "김현수",
                                    "position": "실장_상무",
                                    "email": "hskim@ramostek.com",
                                    "dept": "Flash 개발실",
                                    "isMe": false
                              }
                        ],
                        "children": [
                              {
                                    "id": "flash_1",
                                    "name": "Flash 개발1팀",
                                    "type": "team",
                                    "members": [
                                          {
                                                "name": "정현석",
                                                "position": "팀장_S.Pro",
                                                "email": "hsjeong@ramostek.com",
                                                "dept": "Flash 개발1팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "김영태",
                                                "position": "Pro",
                                                "email": "ytkim@ramostek.com",
                                                "dept": "Flash 개발1팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "심병진",
                                                "position": "Pro",
                                                "email": "bjsim@ramostek.com",
                                                "dept": "Flash 개발1팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "양태욱",
                                                "position": "Pro",
                                                "email": "tuyang@ramostek.com",
                                                "dept": "Flash 개발1팀",
                                                "isMe": false
                                          }
                                    ]
                              },
                              {
                                    "id": "flash_2",
                                    "name": "Flash 개발2팀",
                                    "type": "team",
                                    "members": [
                                          {
                                                "name": "박재환",
                                                "position": "팀장_S.Pro",
                                                "email": "jhpark@ramostek.com",
                                                "dept": "Flash 개발2팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "정유석",
                                                "position": "Senior Pro",
                                                "email": "jys@ramostek.com",
                                                "dept": "Flash 개발2팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "김상우",
                                                "position": "Pro",
                                                "email": "sangwoo2352@ramostek.com",
                                                "dept": "Flash 개발2팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "김태규",
                                                "position": "Pro",
                                                "email": "ktgstar2007@ramostek.com",
                                                "dept": "Flash 개발2팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "조성근",
                                                "position": "Pro",
                                                "email": "sg.cho@ramostek.com",
                                                "dept": "Flash 개발2팀",
                                                "isMe": false
                                          }
                                    ]
                              },
                              {
                                    "id": "flash_3",
                                    "name": "Flash 개발3팀",
                                    "type": "team",
                                    "members": [
                                          {
                                                "name": "이성우",
                                                "position": "팀장_P.Pro",
                                                "email": "fog1007@ramostek.com",
                                                "dept": "Flash 개발3팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "김유진",
                                                "position": "Pro",
                                                "email": "yjkim@ramostek.com",
                                                "dept": "Flash 개발3팀",
                                                "isMe": false
                                          },
                                          {
                                                "name": "홍종혁",
                                                "position": "Pro",
                                                "email": "jhhong@ramostek.com",
                                                "dept": "Flash 개발3팀",
                                                "isMe": false
                                          }
                                    ]
                              }
                        ]
                  }
            ]
      },
      {
            "id": "strat_mgmt",
            "name": "전략경영부문",
            "type": "dept",
            "members": [
                  {
                        "name": "이제현",
                        "position": "부문장_전무",
                        "email": "jaylee@ramostek.com",
                        "dept": "전략경영부문",
                        "isMe": false
                  },
                  {
                        "name": "이용희",
                        "position": "담당_팀장_이사",
                        "email": "iscra74@ramostek.com",
                        "dept": "전략1팀/2팀",
                        "isMe": false
                  }
            ],
            "children": [
                  {
                        "id": "strat_1",
                        "name": "전략1팀",
                        "type": "team",
                        "members": [
                              {
                                    "name": "박상연",
                                    "position": "Senior Pro",
                                    "email": "parksy@ramostek.com",
                                    "dept": "전략1팀",
                                    "isMe": false
                              },
                              {
                                    "name": "고현우",
                                    "position": "Pro",
                                    "email": "hwko@ramostek.com",
                                    "dept": "전략1팀",
                                    "isMe": false
                              },
                              {
                                    "name": "박중민",
                                    "position": "Pro",
                                    "email": "jungmin16@ramostek.com",
                                    "dept": "전략1팀",
                                    "isMe": false
                              }
                        ]
                  },
                  {
                        "id": "strat_2",
                        "name": "전략2팀",
                        "type": "team",
                        "members": [
                              {
                                    "name": "고진규",
                                    "position": "Pro",
                                    "email": "wlsrb9010@ramostek.com",
                                    "dept": "전략2팀",
                                    "isMe": false
                              },
                              {
                                    "name": "김아영",
                                    "position": "Pro",
                                    "email": "kay153@ramostek.com",
                                    "dept": "전략2팀",
                                    "isMe": false
                              },
                              {
                                    "name": "김혜성",
                                    "position": "Pro",
                                    "email": "hyeskim@ramostek.com",
                                    "dept": "전략2팀",
                                    "isMe": false
                              }
                        ]
                  },
                  {
                        "id": "infra_team",
                        "name": "인프라혁신팀",
                        "type": "team",
                        "members": [
                              {
                                    "name": "이상주",
                                    "position": "팀장_P.Pro",
                                    "email": "sjlee@ramostek.com",
                                    "dept": "인프라혁신팀",
                                    "isMe": false
                              },
                              {
                                    "name": "탁현준",
                                    "position": "Pro",
                                    "email": "thj@ramostek.com",
                                    "dept": "인프라혁신팀",
                                    "isMe": false
                              }
                        ]
                  },
                  {
                        "id": "people_grp",
                        "name": "피플그룹",
                        "type": "team",
                        "members": [
                              {
                                    "name": "고미영",
                                    "position": "그룹장_P.Pro",
                                    "email": "turf2313@ramostek.com",
                                    "dept": "피플그룹",
                                    "isMe": false
                              },
                              {
                                    "name": "윤선혜",
                                    "position": "Senior Pro",
                                    "email": "shyun@ramostek.com",
                                    "dept": "피플그룹",
                                    "isMe": false
                              }
                        ]
                  }
            ]
      }
];

    // Bulletproof Data State Management (Prevents any corrupt localStorage or blank screen)
    let storageReadError = null;

    function loadStoredAppData() {
      storageReadError = null;
      const defaultState = {
        cases: JSON.parse(JSON.stringify(INITIAL_CASES)).map(c => ({
          ...c,
          signOffHistory: c.signOffHistory || {},
          approvalAudit: c.approvalAudit || [],
          gates: c.gates || {}
        })),
        intakeQueue: [],
        activeIntakeId: null,
        activeCaseId: INITIAL_CASES[0]?.id || null,
        currentView: 'dashboard',
        activeStage: 'overview',
        sidebarTab: 'menu',
        _storageRevision: 0,
        _storageWriter: '',
        _savedAt: ''
      };

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
          return defaultState;
        }
        const parsed = JSON.parse(raw);

        // Customer names are business data, never a migration/reset criterion.

        // Case A: Parsed is legacy array of cases
        if (Array.isArray(parsed)) {
          return {
            ...defaultState,
            cases: parsed
          };
        }

        // Case B: Parsed is appData object
        if (parsed && typeof parsed === 'object') {
          const validCases = Array.isArray(parsed.cases) ? parsed.cases.map(c => ({
            ...c,
            signOffHistory: c.signOffHistory || {},
            approvalAudit: c.approvalAudit || [],
            gates: c.gates || {}
          })) : [];

          const validActiveId = validCases.some(c => c.id === parsed.activeCaseId) ? parsed.activeCaseId : (validCases[0]?.id || null);
          return {
            cases: validCases,
            intakeQueue: Array.isArray(parsed.intakeQueue) ? parsed.intakeQueue : [],
            activeIntakeId: parsed.activeIntakeId || null,
            activeCaseId: validActiveId,
            currentView: parsed.currentView || 'dashboard',
            activeStage: parsed.activeStage || 'overview',
            sidebarTab: parsed.sidebarTab || 'menu',
            _storageRevision: Number(parsed._storageRevision) || 0,
            _storageWriter: typeof parsed._storageWriter === 'string' ? parsed._storageWriter : '',
            _savedAt: typeof parsed._savedAt === 'string' ? parsed._savedAt : ''
          };
        }
        throw new Error('저장 데이터 형식을 확인할 수 없습니다.');
      } catch (err) {
        storageReadError = err;
        console.error('Stored data retained; saving disabled until recovery:', err);
      }
      return defaultState;
    }

    let appData = loadStoredAppData();

    function saveAppData() {
      try {
        if (storageReadError) throw new Error('기존 저장 데이터를 읽지 못했습니다. 원본을 보존하기 위해 덮어쓰기를 중단합니다.');
        const storedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        const storedRevision = Number(storedState?._storageRevision) || 0;
        const currentRevision = Number(appData._storageRevision) || 0;
        if ((externalStorageRevision > currentRevision || storedRevision > currentRevision)
            && storedState?._storageWriter !== STORAGE_TAB_ID) {
          throw new Error('다른 탭에서 더 최신 데이터가 저장되었습니다. 이 탭을 새로고침한 뒤 계속 작성해 주세요.');
        }
        if (typeof reconcileApprovalChanges === 'function') {
          const previousCases = Array.isArray(storedState) ? storedState : storedState?.cases || [];
          appData.cases.forEach(c => reconcileApprovalChanges(c, previousCases.find(old => old.id === c.id)));
        }
        appData._storageRevision = Math.max(currentRevision, storedRevision) + 1;
        appData._storageWriter = STORAGE_TAB_ID;
        appData._savedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        externalStorageRevision = 0;
        if (typeof QMSApi !== 'undefined' && QMSApi.getState().authenticated) {
          const reason = window.QMS_SAVE_REASON || 'browser business data update';
          window.QMS_SAVE_REASON = '';
          QMSApi.queueCentralSave(appData, reason);
        }
      } catch (e) {
        console.error('Failed to save to localStorage', e);
        alert('저장하지 못했습니다. 현재 화면을 유지하고 저장소 상태를 확인해 주세요.\n' + e.message);
        throw e;
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', event => {
        if (event.key !== STORAGE_KEY || !event.newValue) return;
        try {
          const incoming = JSON.parse(event.newValue);
          const revision = Number(incoming?._storageRevision) || 0;
          if (incoming?._storageWriter !== STORAGE_TAB_ID && revision > (Number(appData?._storageRevision) || 0)) {
            externalStorageRevision = revision;
          }
        } catch (_) {
          // Invalid external state is ignored and never overwrites the current in-memory data.
        }
      });
    }

    function getActiveCase() {
      if (!appData || !Array.isArray(appData.cases) || appData.cases.length === 0) return null;
      const found = appData.cases.find(c => c.id === appData.activeCaseId) || appData.cases[0];
      if (found && appData.activeCaseId !== found.id) appData.activeCaseId = found.id;
      return found || null;
    }

    // =========================================================================
    // CURRENT LOGGED-IN USER & PERSONALIZED TASK ENGINE
    // =========================================================================
    const PRESET_USERS = [
      { username: 'sjkim', name: '김성중', position: 'Senior Pro', dept: '품질혁신팀', email: 'sjkim@ramostek.com', roleDesc: '8D 품질 실무 간사 / Facilitator', isMaster: true },
      { name: '김현수', position: '실장_상무', dept: 'Flash 개발실', email: 'hskim@ramostek.com', roleDesc: '8D Leader (Flash 개발 총괄)' },
      { name: '박재환', position: '팀장_S.Pro', dept: 'Flash 개발2팀', email: 'jhpark@ramostek.com', roleDesc: '불량 분석 리더 (FA / Technical Lead)' },
      { name: '이은산', position: '센터장_상무', dept: '제조기획센터', email: 'eunsan.lee@ramostek.com', roleDesc: '물류/자재 격리 책임자 (Containment Lead)' },
      { name: '황승안', position: '팀장_상무', dept: '품질혁신팀', email: 'sahwang@ramostek.com', roleDesc: '8D Champion (품질혁신 총괄)' },
      { name: '정현석', position: '팀장_S.Pro', dept: 'Flash 개발1팀', email: 'hsjeong@ramostek.com', roleDesc: 'D1 CFT 엔지니어 / 펌웨어' },
      { name: '이성우', position: '팀장_P.Pro', dept: 'Flash 개발3팀', email: 'fog1007@ramostek.com', roleDesc: 'D1 CFT 엔지니어 / 공정기술' },
      { name: '신덕용', position: '팀장_P.Pro', dept: 'DRAM 개발2팀', email: 'satiou@ramostek.com', roleDesc: '8D Leader (DRAM 개발)' },
      { name: '박정훈', position: '부문장_전무', dept: '알앤디부문', email: 'gh8229@ramostek.com', roleDesc: '연구소장 / R&D 총괄' },
      { name: '조장호', position: '대표이사', dept: '대표이사', email: 'jh.choue66@ramostek.com', roleDesc: 'CEO / 최고 의사결정권자' },
      {
        username: 'thkwon',
        name: '권태훈',
        position: '부장',
        dept: 'TechL',
        company: 'TechL',
        supplierId: 'SUP-TECHL',
        supplierCategory: 'SMT_MODULE',
        plant: '',
        email: 'thkwon@techl.co.kr',
        phone: '',
        roleDesc: '외주 협력사 담당자 (TechL)',
        userType: 'SUPPLIER',
        isSupplier: true,
        isMaster: false
      },
      {
        username: 'yspark',
        name: '박영수',
        position: '차장',
        dept: 'WinPAC',
        company: 'WinPAC',
        supplierId: 'SUP-WINPAC',
        supplierCategory: 'OSAT_PKG',
        plant: '',
        email: 'yspark@winpac.co.kr',
        phone: '',
        roleDesc: '외주 협력사 담당자 (WinPAC)',
        userType: 'SUPPLIER',
        isSupplier: true,
        isMaster: false
      },
      {
        username: 'sangwook.ki',
        name: '기상욱',
        position: '팀장',
        dept: 'SSPC',
        company: 'SSPC',
        supplierId: 'SUP-SSPC',
        supplierCategory: 'OSAT_PKG',
        plant: '',
        email: 'sangwook.ki@sfasemicon.com',
        phone: '',
        roleDesc: '외주 협력사 담당자 (SSPC)',
        userType: 'SUPPLIER',
        isSupplier: true,
        isMaster: false
      },
      {
        username: 'ojs',
        name: '오재수',
        position: '그룹장',
        dept: 'CTST',
        company: 'CTST',
        supplierId: 'SUP-CTST',
        supplierCategory: 'TEST_HOUSE',
        plant: '',
        email: 'ojs@ctst.co.kr',
        phone: '',
        roleDesc: '외주 협력사 담당자 (CTST)',
        userType: 'SUPPLIER',
        isSupplier: true,
        isMaster: false
      }
    ];

    let CURRENT_USER = PRESET_USERS[0]; // Default: 김성중 S.Pro
    if (typeof window !== 'undefined') window.CURRENT_USER = CURRENT_USER;

    function setCurrentUser(userName) {
      const found = PRESET_USERS.find(u => u.name === userName || u.username === userName || u.email === userName);
      if (found) {
        CURRENT_USER = found;
        if (typeof window !== 'undefined') window.CURRENT_USER = found;
        localStorage.setItem('RAMOS_CURRENT_USER', found.name);
      }
    }

    function loadCurrentUser() {
      const saved = localStorage.getItem('RAMOS_CURRENT_USER');
      if (saved) {
        const found = PRESET_USERS.find(u => u.name === saved || u.username === saved);
        if (found) CURRENT_USER = found;
      }
      if (typeof window !== 'undefined') window.CURRENT_USER = CURRENT_USER;
    }
    loadCurrentUser();

    function getAllUserAccounts() {
      const accounts = [];
      const seenEmails = new Set();

      function traverse(node, parentDept = '') {
        const deptName = node.name || parentDept;
        (node.members || []).forEach(member => {
          if (!member.email || !member.email.includes('@')) return;
          const email = member.email.toLowerCase();
          if (seenEmails.has(email)) return;
          seenEmails.add(email);
          const preset = PRESET_USERS.find(user => user.email.toLowerCase() === email);
          accounts.push({
            username: email.split('@')[0],
            password: '1',
            name: member.name,
            position: member.position || 'Pro',
            dept: member.dept || deptName,
            email: member.email,
            isMe: Boolean(member.isMe),
            roleDesc: preset?.roleDesc || 'CFT 유관부서 담당자',
            isMaster: Boolean(preset?.isMaster)
          });
        });
        (node.children || []).forEach(child => traverse(child, deptName));
      }

      RAMOS_TREE.forEach(root => traverse(root));
      PRESET_USERS.forEach(user => {
        if (!seenEmails.has(user.email.toLowerCase())) accounts.push({ ...user, password: '1' });
      });
      return accounts;
    }

    const ALL_USER_ACCOUNTS = getAllUserAccounts();

    function authenticateUser(username, password) {
      const cleanUser = String(username || '').trim().toLowerCase();
      const cleanPassword = String(password || '').trim();
      if (!cleanUser || cleanPassword !== '1') return null;

      if (['supplier', '외주', '외주사'].includes(cleanUser)) {
        const sup = PRESET_USERS.find(u => u.username === 'thkwon');
        if (sup) return { ...sup, password: '1' };
      }

      return ALL_USER_ACCOUNTS.find(account =>
        account.username.toLowerCase() === cleanUser ||
        account.email.toLowerCase() === cleanUser ||
        account.name.toLowerCase() === cleanUser
      ) || null;
    }

    function hasMasterAuthority(user = CURRENT_USER) {
      return Boolean(user?.isMaster || user?.email === 'sjkim@ramostek.com');
    }

    function getUserPendingTasks(user = CURRENT_USER) {
      const tasks = [];
      if (user?.isSupplier) {
        if (typeof loadSupplierRecords === 'function') {
          try {
            const suppRecords = loadSupplierRecords();
            suppRecords
              .filter(r => r.supplier?.companyName === user.company || r.supplier?.email === user.email)
              .forEach(r => {
                if (r.status === 'Under_Review') {
                  tasks.push({
                    caseId: r.ticketId,
                    customer: r.targetProduct?.customer || 'LGE DTV',
                    targetStage: 'supplier-portal',
                    stageCode: '성적서 심의',
                    urgency: 'high',
                    isApproval: false,
                    title: `[SQE 성적서 심의 중] ${r.details?.title || r.ticketId}`,
                    desc: `라모스 SQE 검토의견: "${r.sqeReview?.comment || '추가 신뢰성 데이터 교차 검증 중'}"`
                  });
                } else if (r.status === 'Approved') {
                  tasks.push({
                    caseId: r.ticketId,
                    customer: r.targetProduct?.customer || 'LGE DTV',
                    targetStage: 'supplier-portal',
                    stageCode: '승인 완료',
                    urgency: 'normal',
                    isApproval: false,
                    title: `[4M 변경 승인 완료] ${r.details?.title || r.ticketId}`,
                    desc: `양산 적용 승인되었습니다. A4 심의 통보서를 확인하세요.`
                  });
                }
              });
          } catch (_) {}
        }
        return tasks;
      }

      const cases = (appData && Array.isArray(appData.cases)) ? appData.cases : INITIAL_CASES;
      const intakeQueue = (appData && Array.isArray(appData.intakeQueue)) ? appData.intakeQueue : [];
      const canReviewIntake = hasMasterAuthority(user) || user?.dept === '품질혁신팀';

      if (canReviewIntake) {
        intakeQueue
          .filter(item => ['Quality Review Pending', 'Quality Review In Progress'].includes(item.status))
          .forEach(item => {
            tasks.unshift({
              caseId: item.intakeId,
              customer: item.customer,
              targetStage: 'intake-triage',
              stageCode: 'STEP 02. Triage',
              urgency: item.riskSignals?.lineStop || item.riskSignals?.safetyRisk ? 'critical' : 'high',
              isApproval: false,
              title: item.status === 'Quality Review Pending' ? '[신규 접수 품질 검토 대기]' : '[품질 검토 진행 중]',
              desc: `${item.customer} · ${item.product} · ${item.claimTitle}`
            });
          });
      }

      cases.forEach(c => {
        const cft = c.team || [];
        const isMember = cft.some(m => m.name && m.name.includes(user.name));

        // Ensure gates sanitized
        if (typeof ensureCaseGates === 'function') {
          ensureCaseGates(c);
        }
        const gates = c.gates || {};

        if (typeof stageApprover === 'function') {
          Object.entries(c.signOffHistory || {}).forEach(([stage, sign]) => {
            const role = {Submitted:'leader', LeaderApproved:'champion'}[sign.status];
            const assigned = role ? stageApprover(c, role) : null;
            if (assigned?.email === user.email) tasks.push({
              caseId:c.id, customer:c.customer, targetStage:stage, stageCode:`${stage} 결재`,
              urgency:'high', isApproval:true, title:`[단계 결재 대기] ${stage} ${role} 검토`,
              desc:'기안 시점 내용을 확인하고 본인 계정으로 서명해 주세요.'
            });
          });
        }

        // A. DIRECT ELECTRONIC SIGN-OFF & APPROVAL TASKS (우선순위 최고: 1차/2차/3차 내부결재 및 4차 고객송부)
        ['gate3D', 'gate5D', 'gate8D'].forEach(gk => {
          const g = gates[gk];
          if (!g || !Array.isArray(g.approvers)) return;
          if (typeof reportReviewError === 'function' && reportReviewError(c,gk)) return;

          // Find the active pending approver
          for (let i = 0; i < g.approvers.length; i++) {
            const appr = g.approvers[i];
            if (appr.status !== 'Approved') {
              // If this pending step is for the current user
              if (typeof reportApprover === 'function' && reportApprover(appr)?.email === user.email) {
                const isDispatch = (i === 3);
                tasks.push({
                  caseId: c.id,
                  customer: c.customer,
                  targetStage: 'reports-hub',
                  gateKey: gk,
                  stageCode: isDispatch ? '고객 송부' : '결재 대기',
                  urgency: 'critical',
                  isApproval: true,
                  stepNum: i + 1,
                  role: appr.role,
                  title: isDispatch
                    ? `[고객사 공식 송부 대기] ${g.title} 내부 승인 완료 ➔ 고객사 송부 실행 필요`
                    : `[전자 결재 승인 대기] ${g.title} (${appr.role}) 승인 필요`,
                  desc: isDispatch
                    ? `3차 8D Champion 결재 완료됨. SLA 준수를 위해 ${c.customerContact || '고객품질팀'} 앞 메일 발송을 처리하세요.`
                    : `이전 결재 단계 완료됨. 8D 공식 보고서 내용 검토 후 [${appr.name}] 님의 승인 서명을 완료하세요.`
                });
              }
              break; // Only the first pending approver in sequence is active
            }
          }
        });

        // B. ROLE-SPECIFIC 8D PROBLEM SOLVING TASKS
        // 1. 김성중 S.Pro (품질 실무 간사)
        if (user.name === '김성중') {
          if (cft.length < 4) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D1',
              stageCode: 'D1. Team',
              urgency: 'high',
              isApproval: false,
              title: `[CFT 편성 누락] 전사 조직도에서 8D 리더 및 FA/물류 책임자 배속 필요`,
              desc: `현재 CFT 인원이 ${cft.length}명으로 부족합니다. 조직도에서 엔지니어를 추가 배속하세요.`
            });
          }
        }

        // 2. 김현수 실장 / 신덕용 팀장 (8D Leader)
        if (user.name === '김현수' || user.name === '신덕용' || user.roleDesc.includes('Leader')) {
          if (c.currentStage === 'D4' && (!c.d4?.candidateCauses || c.d4?.candidateCauses.length === 0)) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D4',
              stageCode: 'D4. Root Cause',
              urgency: 'high',
              isApproval: false,
              title: `[원인분석 주관] 5-Why 및 물리적 FA 메커니즘 기술 검토 및 원인 확정 필요`,
              desc: `불량 현상(${c.claimTitle})에 대한 개발실 주관의 5-Why 원인 확정 및 검증이 필요합니다.`
            });
          }
        }

        // 3. 박재환 팀장 (FA 불량 분석 리더)
        if (user.name === '박재환' || user.roleDesc.includes('FA')) {
          const hasFAEvidence = (c.evidenceList || []).some(e => e.type === 'FA Analysis' || (e.linkedStages || []).includes('D4'));
          if (!hasFAEvidence) {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D4',
              stageCode: 'D4. FA 성적서',
              urgency: 'critical',
              isApproval: false,
              title: `[물리적 분석 증거 누락] Decap 및 SEM 단면 분석 성적서(EVD) 등록 필요`,
              desc: `불량 시료 ${c.defectQty}ea에 대한 X-Ray, Decap, SEM 단면 Crack 정밀 분석 보고서를 등록하세요.`
            });
          }
        }

        // 4. 이은산 센터장 (물류/자재 격리 책임자)
        if (user.name === '이은산' || user.roleDesc.includes('격리')) {
          const hasMaterialFlow = c.d3?.materialFlow && c.d3.materialFlow.length > 0;
          if (!hasMaterialFlow || c.currentStage === 'D1' || c.currentStage === 'D2' || c.currentStage === 'D3') {
            tasks.push({
              caseId: c.id,
              customer: c.customer,
              targetStage: 'D3',
              stageCode: 'D3. Containment',
              urgency: 'high',
              isApproval: false,
              title: `[긴급 재고 봉쇄] 평택공장 완제품 ERP 출하 락 및 원부자재 격리 조치 필요`,
              desc: `Lot ${c.lotNumber} 관련 창고 재고 및 협력사 입고분 100% 격리 현황을 확정하세요.`
            });
          }
        }

        // 5. 일반 CFT 팀원 (정현석, 이성우, 양태욱 등)
        if (isMember && user.name !== '김성중' && user.name !== '황승안') {
          tasks.push({
            caseId: c.id,
            customer: c.customer,
            targetStage: c.currentStage || 'D1',
            stageCode: `${c.currentStage} 단계`,
            urgency: 'normal',
            isApproval: false,
            title: `[CFT 참여] Case ${c.id} (${c.product}) 문제 해결 액션 실행`,
            desc: `현재 ${c.currentStage} 단계 작업 및 소속 부서별 개선 대책에 협업하세요.`
          });
        }
      });

      return tasks;
    }


    window.resetToReal16GBData = function() {
      location.reload();
    };
