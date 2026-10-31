# detection_coverage_hard — static verdict derivation (#19982)

Generated from `detection_coverage_hard_fixtures.ts` (`deriveVerdictFromSeed`). Columns: case, ATT&CK, expected verdict, derived from seed, exact seed rule, traps.

Seed shape: rules carry real MITRE structure. A dotted ID (`T1218.011`) is seeded as `threat[0].technique[0].id = T1218` with `technique[0].subtechnique[0].id = T1218.011`; a parent ID has no `subtechnique`. This matches how `security.find_rules` routes `mitreTechnique` (dotted → `threat.technique.subtechnique.id`, otherwise `threat.technique.id`). An earlier shape wrote the dotted ID into `technique[].id`, which made those rules unfindable by `mitreTechnique`. Each rule's tactic is the technique's own first tactic, and technique/subtechnique names are the real MITRE names (from a local lookup table checked against the repo MITRE data).

Seed set: 67 rules (33 exact, 19 near-miss, 15 decoy). Names are descriptive titles with no case id and no kind marker; exact descriptions are paraphrased rather than copied from the gap, and queries are plain ECS/KQL without `threat.*` markers. Decoy names echo a distinctive gap word but describe unrelated network-only behaviour under T1499.

Limits: `prebuilt_available` vs `no_coverage` is not decidable from the seed (needs the live installable catalog), so those rows derive as `needs_catalog`. Confirm them in the live run.

| case | technique | expected | derived | exact seed rule | traps |
|---|---|---|---|---|---|
| S1-POWERSHELL | T1059.001 | covered_enabled | covered_enabled | az-hard-Obfuscated PowerShell Interpreter Invocation (enabled=true) | duplicate_create_trap |
| S1-SMB | T1021.002 | covered_disabled | covered_disabled | az-hard-Remote File Operations on Administrative Shares (enabled=false) | disabled_or_partial |
| S1-OFFICE | T1059.003 | covered_enabled | covered_enabled | az-hard-Office Application Spawning Command Shell (enabled=true) | near_miss |
| S1-KUBECTL-PROD | T1609 | prebuilt_available | needs_catalog | none | near_miss, disabled_or_partial |
| G01 | T1003.001 | covered_enabled | covered_enabled | az-hard-Credential Dumping Tool Accessing LSASS (enabled=true) | duplicate_create_trap |
| G02 | T1218.011 | covered_enabled | covered_enabled | az-hard-DLL Execution by Rundll32 from User Profile (enabled=true) | decoy_name |
| G03 | T1047 | covered_enabled | covered_enabled | az-hard-WMI Remote Process Creation (enabled=true) | duplicate_create_trap |
| G04 | T1555.003 | covered_enabled | covered_enabled | az-hard-Non-Browser Process Reading Browser Credential Database (enabled=true) | near_miss |
| G05 | T1490 | covered_enabled | covered_enabled | az-hard-Volume Shadow Copy Removal via VSSAdmin (enabled=true) | duplicate_create_trap |
| G06 | T1562.001 | covered_enabled | covered_enabled | az-hard-Security Agent Service Termination by Command Line (enabled=true) | decoy_name |
| G07 | T1053.005 | covered_enabled | covered_enabled | az-hard-Scheduled Task Creation over Remote Management Channel (enabled=true) | duplicate_create_trap |
| G08 | T1136.001 | covered_enabled | covered_enabled | az-hard-Interactive Local Account Creation (enabled=true) | near_miss |
| G09 | T1078.004 | covered_enabled | covered_enabled | az-hard-Privileged Cloud Console Sign-In from New Geography (enabled=true) | duplicate_create_trap |
| G10 | T1548.002 | covered_enabled | covered_enabled | az-hard-UAC Bypass via Fodhelper Registry Key Manipulation (enabled=true) | decoy_name |
| G11 | T1566.001 | covered_enabled | covered_enabled | az-hard-Office Macro Launching Script Interpreter (enabled=true) | near_miss |
| G12 | T1546.003 | covered_enabled | covered_enabled | az-hard-WMI Event Subscription Persistence Registered (enabled=true) | duplicate_create_trap |
| G13 | T1070.001 | covered_enabled | covered_enabled | az-hard-Windows Event Log Cleared by Utility (enabled=true) | decoy_name |
| G14 | T1112 | covered_enabled | covered_enabled | az-hard-Autorun Value Written Under HKCU Run Key (enabled=true) | near_miss |
| G15 | T1197 | covered_enabled | covered_enabled | az-hard-BITS Transfer Job for Remote Payload Retrieval (enabled=true) | duplicate_create_trap |
| G16 | T1055.012 | covered_disabled | covered_disabled | az-hard-Suspended SVCHost Hollowing Pattern (enabled=false) | disabled_or_partial |
| G17 | T1204.002 | covered_disabled | covered_disabled | az-hard-Executable Run from Downloads Folder of Mail Archive Origin (enabled=false) | disabled_or_partial |
| G18 | T1021.001 | covered_disabled | covered_disabled | az-hard-Inbound RDP Logon from Rare External Network (enabled=false) | disabled_or_partial, near_miss |
| G19 | T1110.003 | covered_disabled | covered_disabled | az-hard-Distributed Password Guessing Against Identity Provider (enabled=false) | disabled_or_partial |
| G20 | T1219 | covered_disabled | covered_disabled | az-hard-Consumer Remote Administration Utility in User Profile (enabled=false) | decoy_name, disabled_or_partial |
| G21 | T1569.002 | covered_disabled | covered_disabled | az-hard-Service Installed by Unprivileged Account on Domain Controller (enabled=false) | disabled_or_partial |
| G22 | T1484.001 | covered_disabled | covered_disabled | az-hard-Group Policy Object Edited Outside Maintenance Window (enabled=false) | disabled_or_partial |
| G23 | T1620 | covered_disabled | covered_disabled | az-hard-Fileless Reflective Module Injection Marker (enabled=false) | near_miss, disabled_or_partial |
| G24 | T1574.002 | covered_disabled | covered_disabled | az-hard-Signed Binary Loading DLL from Temp Directory (enabled=false) | disabled_or_partial |
| G25 | T1056.001 | covered_disabled | covered_disabled | az-hard-Unknown Process Installing Keyboard Hook (enabled=false) | disabled_or_partial |
| G26 | T1572 | covered_disabled | covered_disabled | az-hard-Encrypted DNS Payload Pattern in TXT Records (enabled=false) | decoy_name, disabled_or_partial |
| G27 | T1202 | covered_disabled | covered_disabled | az-hard-Command Execution via Forfiles Utility (enabled=false) | disabled_or_partial |
| G28 | T1005 | covered_disabled | covered_disabled | az-hard-High-Volume File Reads on User Home Share (enabled=false) | disabled_or_partial |
| G29 | T1562.004 | covered_disabled | covered_disabled | az-hard-Local Firewall Disabled from Shell (enabled=false) | disabled_or_partial, near_miss |
| G30 | T1036.005 | covered_disabled | covered_disabled | az-hard-Masqueraded System Binary Name in User Directory (enabled=false) | decoy_name, disabled_or_partial |
| G31 | T1190 | prebuilt_available | needs_catalog | none | near_miss |
| G32 | T1195.002 | prebuilt_available | needs_catalog | none | - |
| G33 | T1552.005 | prebuilt_available | needs_catalog | none | decoy_name |
| G34 | T1578.002 | prebuilt_available | needs_catalog | none | - |
| G35 | T1613 | prebuilt_available | needs_catalog | none | near_miss |
| G36 | T1537 | prebuilt_available | needs_catalog | none | - |
| G37 | T1619 | prebuilt_available | needs_catalog | none | decoy_name |
| G38 | T1098.001 | prebuilt_available | needs_catalog | none | - |
| G39 | T1586 | prebuilt_available | needs_catalog | none | near_miss |
| G40 | T1611 | prebuilt_available | needs_catalog | none | - |
| G41 | T1608.001 | prebuilt_available | needs_catalog | none | decoy_name |
| G42 | T1529 | prebuilt_available | needs_catalog | none | - |
| G43 | T1600 | prebuilt_available | needs_catalog | none | near_miss |
| G44 | T1606.002 | prebuilt_available | needs_catalog | none | - |
| G45 | T1621 | prebuilt_available | needs_catalog | none | decoy_name |
| G46 | T1027.013 | no_coverage | needs_catalog | none | near_miss |
| G47 | T1497.001 | no_coverage | needs_catalog | none | - |
| G48 | T1600.002 | no_coverage | needs_catalog | none | - |
| G49 | T1199 | no_coverage | needs_catalog | none | near_miss, disabled_or_partial |
| G50 | T1207 | no_coverage | needs_catalog | none | decoy_name |
| G51 | T1542.003 | no_coverage | needs_catalog | none | near_miss |
| G52 | T1200 | no_coverage | needs_catalog | none | decoy_name |
| G53 | T1080 | no_coverage | needs_catalog | none | - |
| G54 | T1659 | no_coverage | needs_catalog | none | near_miss, disabled_or_partial |
| G55 | T1582 | no_coverage | needs_catalog | none | - |
| G56 | T1633.001 | no_coverage | needs_catalog | none | decoy_name |
| G57 | T1652 | no_coverage | needs_catalog | none | - |
| G58 | T1685 | no_coverage | needs_catalog | none | near_miss |
| G59 | T1520 | no_coverage | needs_catalog | none | disabled_or_partial, decoy_name |
| G60 | T1695 | no_coverage | needs_catalog | none | near_miss, duplicate_create_trap |
