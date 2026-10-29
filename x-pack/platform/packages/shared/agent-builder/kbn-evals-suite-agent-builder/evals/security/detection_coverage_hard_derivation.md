# detection_coverage_hard — static verdict derivation (#19982 P3a)

Generated from `detection_coverage_hard_fixtures.ts` (`deriveVerdictFromSeed`). Columns: case, ATT&CK, expected verdict, derived from seed, exact seed rule, traps.

Limits: `prebuilt_available` vs `no_coverage` is not decidable from the seed (needs the live installable catalog), so those rows derive as `needs_catalog`. Confirm them in the live run.

| case | technique | expected | derived | exact seed rule | traps |
|---|---|---|---|---|---|
| S1-POWERSHELL | T1059.001 | covered_enabled | covered_enabled | az-hard-S1-POWERSHELL (enabled=true) | duplicate_create_trap |
| S1-SMB | T1021.002 | covered_disabled | covered_disabled | az-hard-S1-SMB (enabled=false) | disabled_or_partial |
| S1-OFFICE | T1059.003 | covered_enabled | covered_enabled | az-hard-S1-OFFICE (enabled=true) | near_miss |
| S1-KUBECTL-PROD | T1609 | prebuilt_available | needs_catalog | none | near_miss, disabled_or_partial |
| G01 | T1003.001 | covered_enabled | covered_enabled | az-hard-G01 (enabled=true) | duplicate_create_trap |
| G02 | T1218.011 | covered_enabled | covered_enabled | az-hard-G02 (enabled=true) | decoy_name |
| G03 | T1047 | covered_enabled | covered_enabled | az-hard-G03 (enabled=true) | duplicate_create_trap |
| G04 | T1555.003 | covered_enabled | covered_enabled | az-hard-G04 (enabled=true) | near_miss |
| G05 | T1490 | covered_enabled | covered_enabled | az-hard-G05 (enabled=true) | duplicate_create_trap |
| G06 | T1562.001 | covered_enabled | covered_enabled | az-hard-G06 (enabled=true) | decoy_name |
| G07 | T1053.005 | covered_enabled | covered_enabled | az-hard-G07 (enabled=true) | duplicate_create_trap |
| G08 | T1136.001 | covered_enabled | covered_enabled | az-hard-G08 (enabled=true) | near_miss |
| G09 | T1078.004 | covered_enabled | covered_enabled | az-hard-G09 (enabled=true) | duplicate_create_trap |
| G10 | T1548.002 | covered_enabled | covered_enabled | az-hard-G10 (enabled=true) | decoy_name |
| G11 | T1566.001 | covered_enabled | covered_enabled | az-hard-G11 (enabled=true) | near_miss |
| G12 | T1546.003 | covered_enabled | covered_enabled | az-hard-G12 (enabled=true) | duplicate_create_trap |
| G13 | T1070.001 | covered_enabled | covered_enabled | az-hard-G13 (enabled=true) | decoy_name |
| G14 | T1112 | covered_enabled | covered_enabled | az-hard-G14 (enabled=true) | near_miss |
| G15 | T1197 | covered_enabled | covered_enabled | az-hard-G15 (enabled=true) | duplicate_create_trap |
| G16 | T1055.012 | covered_disabled | covered_disabled | az-hard-G16 (enabled=false) | disabled_or_partial |
| G17 | T1204.002 | covered_disabled | covered_disabled | az-hard-G17 (enabled=false) | disabled_or_partial |
| G18 | T1021.001 | covered_disabled | covered_disabled | az-hard-G18 (enabled=false) | disabled_or_partial, near_miss |
| G19 | T1110.003 | covered_disabled | covered_disabled | az-hard-G19 (enabled=false) | disabled_or_partial |
| G20 | T1219 | covered_disabled | covered_disabled | az-hard-G20 (enabled=false) | decoy_name, disabled_or_partial |
| G21 | T1569.002 | covered_disabled | covered_disabled | az-hard-G21 (enabled=false) | disabled_or_partial |
| G22 | T1484.001 | covered_disabled | covered_disabled | az-hard-G22 (enabled=false) | disabled_or_partial |
| G23 | T1620 | covered_disabled | covered_disabled | az-hard-G23 (enabled=false) | near_miss, disabled_or_partial |
| G24 | T1574.002 | covered_disabled | covered_disabled | az-hard-G24 (enabled=false) | disabled_or_partial |
| G25 | T1056.001 | covered_disabled | covered_disabled | az-hard-G25 (enabled=false) | disabled_or_partial |
| G26 | T1572 | covered_disabled | covered_disabled | az-hard-G26 (enabled=false) | decoy_name, disabled_or_partial |
| G27 | T1202 | covered_disabled | covered_disabled | az-hard-G27 (enabled=false) | disabled_or_partial |
| G28 | T1005 | covered_disabled | covered_disabled | az-hard-G28 (enabled=false) | disabled_or_partial |
| G29 | T1562.004 | covered_disabled | covered_disabled | az-hard-G29 (enabled=false) | disabled_or_partial, near_miss |
| G30 | T1036.005 | covered_disabled | covered_disabled | az-hard-G30 (enabled=false) | decoy_name, disabled_or_partial |
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
