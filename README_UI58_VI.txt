RHYTHM KITCHEN UI58 - UNITY 6 EDITOR PATCH
===========================================

MUC TIEU
- Fix thanh Timer: dong ho vang, thanh xanh ngoc, MM:SS khong chong nhau.
- Bat input hai ngon: nhan 2 note doc lap bang 2 pointerId.
- Quet va doc MIDI + Audio Full cung ten thanh song pair JSON.

CAI DAT
1) Sao luu project.
2) Download ZIP, giai nen; vao thu muc con cho den khi thay "Assets".
3) Copy thu muc "Assets" vao GOC PROJECT Unity (ngang cap Packages).
4) Mo Assets/_Project/Scenes/04_Gameplay.unity, doi Unity compile.
5) Chay menu:
   Tools > Rhythm Kitchen > UI58 - Timer + 2 Fingers
   > 01 - Fix Timer + Enable Two Fingers
6) Neu co MIDI + AudioClip cung ten:
   Tools > Rhythm Kitchen > UI58 - Timer + 2 Fingers
   > 03 - Import Full + MIDI Pairs
7) Ctrl+S de luu Scene, sau do Play Mode va thu tren thiet bi cam ung.

QUY TAC FULL/MIDI
VD:  Song01_full.wav va Song01_midi.mid
- Full: AudioClip duoc gan boi RK58SongBank.SetFullAudioBeforeConductorStarts().
- MIDI: convert thanh JSON co time, duration, pitch, velocity, track, channel.
- MIDI khong phat am thanh, chi la du lieu note.
- Khong tao bo phat audio hay bo cham diem moi.

GIOI HAN HIEU LUC
- MIDI JSON duoc import, CHUA tu dong gan vao NoteSpawner cua project.
  Can map du lieu chart vao NoteChart theo API hien tai.
- Gameplay04IngredientNoteVisual da phan biet pointerId theo tung note.
  Patch cho phep input nhieu ngon nhung neu RhythmKeyboardTest luu 1 HOLD
  toan cuc, can sua logic HOLD rieng de ho tro HOLD + TAP dong thoi.
- Khong ghi de file Unity cu. Khong co Scene duoc sua san; ban chay menu.
- Chua Play-test tren Unity 6000 duoc. Neu Console loi, gui log de sua.

CO FILE:
Assets/_Project/Scripts/Rhythm/RK58Runtime.cs
Assets/_Project/Editor/RK58SceneFixEditor.cs
Assets/_Project/Editor/RK58MidiImporter.cs
README_UI58_VI.txt

VERSION: UI58 ZIP branch package / 2026-10-30
