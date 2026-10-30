RHYTHM KITCHEN UI58 — HOTFIX 2026-10-30
=======================================
SUA:
- warning TMP_Text.enableWordWrapping obsolete (use textWrappingMode).
- 'RK58MidiNote' is missing ExtensionOfNativeClass.
- GameObject TimerPlate references runtime script in scene file. Fixing!
- Old RK58_Multitouch / RK58_SongBank legacy script references.

NGUYEN NHAN:
RK58Runtime.cs co GUID da duoc gan vao Scene. Sau khi tach file,
no chi chua RK58MidiNote (Serializable data, NOT MonoBehaviour).
Unity co gang su dung class data do de deserialise component cu.
Hotfix phuc hoi lop RK58Runtime : MonoBehaviour voi TEN TRUNG FILE,
chuyen MIDI data sang RK58MidiModels.cs, de Unity co the doc
tham chieu cu truoc khi Editor migrate sang MonoBehaviour dung.

CAI DAT:
1. Sao luu Scene 04_Gameplay.unity.
2. Thoat Play Mode. Giai nen ZIP vao project (ngang Assets, Packages).
3. GHI DE RK58Runtime.cs va RK58SceneReferenceRepair.cs.
4. DA SOAT: khong de hai phien ban file RK58Runtime.cs (copy) trong Assets.
5. Mo Unity, de script recompile hoan tat.
6. Mo Scene 04_Gameplay.
7. Tools > Rhythm Kitchen > UI58 - Timer + 2 Fingers
   > 00 - Repair UI58 Scene References
8. Nhung ten duoc sua: TimerPlate, RK58_Multitouch, RK58_SongBank.
9. Neu timer khong hien thi chuan, chay menu 01 - Fix Timer + Enable Two Fingers.
10. Neu SongBank khong co bai, chay menu 03 - Import Full + MIDI Pairs.
11. Ctrl+S; dong Scene, mo lai; kiem tra Console va Play.

LUU Y:
- KHONG xoa RK58Runtime.cs: day la GUID compatibility shim.
- Khong sua scoring/NoteController. Khong gia lap event cham.
- MIDI importer van chi tao JSON; chua noi NoteSpawner.
- Chua co Unity 6 Play Mode verification. 
