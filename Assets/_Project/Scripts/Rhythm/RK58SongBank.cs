using System.Collections.Generic;
using UnityEngine;

[DisallowMultipleComponent]
public sealed class RK58SongBank : MonoBehaviour
{
    public AudioSource conductorAudio;
    public List<RK58SongEntry> songs = new List<RK58SongEntry>();

    public RK58MidiChart ReadMidi(int songIndex)
    {
        if (songIndex < 0 || songIndex >= songs.Count ||
            !songs[songIndex].midiChartJson) return null;
        return JsonUtility.FromJson<RK58MidiChart>(
            songs[songIndex].midiChartJson.text);
    }

    public bool SetFullAudioBeforeConductorStarts(int songIndex)
    {
        if (!conductorAudio || songIndex < 0 || songIndex >= songs.Count ||
            !songs[songIndex].fullAudio) return false;
        // Existing RhythmConductor starts the clip. Do not start a second player.
        conductorAudio.clip = songs[songIndex].fullAudio;
        return true;
    }
}
