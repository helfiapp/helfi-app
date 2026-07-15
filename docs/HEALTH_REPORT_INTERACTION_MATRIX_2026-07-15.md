# Health Report Interaction Matrix

Task: HEL-468
Report period rule: every detail view must use the selected saved report's `periodStart` and `periodEnd`, never today's live data.

| Tile/control | Detail view for the selected week | Accuracy checks | Empty/loading/error | Motion and accessibility | Web evidence | iOS evidence | Retest |
|---|---|---|---|---|---|---|---|
| Food logs | Daily energy and macros, averages, top foods, nutrition guidance | 28 logs and all seven saved dates matched | Honest empty message included | Animated bars; motion check disables animation when Reduce Motion is on | `web-food-detail.png` | `ios-food-detail.png` | Pass |
| Water logs | Log count, days logged, daily amounts, top drinks | 21 logs and all seven saved dates matched | Honest empty message included | Animated bars; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| Mood entries | Average mood, trend, daily values, tags and notes | Seven entries and selected-week dates matched | Honest empty message included | Animated reveal; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| Check-ins | Overall rating when available, tracked goals, daily ratings and notes | 21 ratings matched; older report did not invent missing averages | Honest empty message included | Animated reveal; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| Symptoms | Entry count, unique symptoms, daily activity and top symptoms | Seven entries and daily activity matched | Honest empty message included | Animated bars; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| Exercise | Sessions, active days, minutes, distance and top activities | Seven sessions and 270 saved minutes matched | Honest empty message included | Animated bars; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| Journal notes | Entry count, days and saved highlights | Highlights stayed inside 29 Apr to 05 May 2026 | Honest empty message included | Animated reveal; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| Health image notes | Entry count, days, highlights, possible causes and next steps | Selected-week zero remained zero | Empty state tested | Animated reveal; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| Lab uploads | Upload count, saved highlights and marker movement | Selected-week zero remained zero | Empty state tested | Animated reveal; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| AI chats | Verified saved prompt count, active days, General/Food split and separate history links | Verified zero replaced the stale generated activity; unverified generated topics and highlights are not shown | Verified-zero on web and verification-unavailable before API deployment on iOS | Animated reveal; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass; live API retest after deploy |
| Hydration summary | Total volume, daily average, days, daily amounts and top drinks | 15.55 L total and 2.22 L daily average matched Water logs | Honest empty message included | Animated bars; Reduce Motion supported | `web-data-used-all-tiles.png` | Real simulator flow | Pass |
| Summary / Charts / Insights / Details | Keep the selected report and return to the same place | Archived demo report stayed on 29 Apr to 05 May 2026 | Existing report-level states preserved | Native chart tab and normal reveal tested; Reduce Motion disables new animation | Signed-in Chrome | `ios-charts.png` | Pass |
| Save as PDF / Print | Static, complete, readable, multi-page report with chart sections expanded | Saved report dates and verified-zero chats matched | Clear API error responses preserved | Static only | Real signed-in Chrome preview: 18 pages with static chart content | Real API PDF: 8 A4 pages, all pages rendered and inspected | Pass |

## Regression checks that must remain green

- Web saved-chat verification: verified zero shows "No saved chats this week"; a failed check says it could not be checked.
- Web print layout keeps automatic multi-page flow and does not stop after page 1.
- iOS uses the same saved-chat truth as web.
- iOS PDF includes the complete report, not the older shortened version.
- Normal motion was visually checked. Web and iPhone both use the operating-system Reduce Motion setting to turn the new animation off.
- Closing a web or iPhone detail view returns accessibility focus to the tile that opened it.
- The newest report and at least one older report are checked so every tile stays on the chosen week.
