using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

// Reads an EXISTING timer: it never changes the underlying song clock.
[DisallowMultipleComponent]
public sealed class RK58TimerView : MonoBehaviour
{
    public TMP_Text sourceTMP;
    public Text sourceLegacy;
    public TextMeshProUGUI display;
    public Image fill;
    [Min(1f)] public float fullSeconds = 60f;

    void LateUpdate()
    {
        if (!display || !fill) return;
        string s = sourceTMP ? sourceTMP.text : sourceLegacy ? sourceLegacy.text : null;
        if (string.IsNullOrEmpty(s)) return;
        display.text = s;
        string[] a = s.Trim().Split(':');
        int m, sec;
        if (a.Length != 2 || !int.TryParse(a[0], out m) ||
            !int.TryParse(a[1], out sec) || m < 0 || sec < 0 || sec > 59)
            return;
        float remain = m * 60f + sec;
        if (remain > fullSeconds) fullSeconds = remain;
        fill.fillAmount = Mathf.Clamp01(remain / Mathf.Max(1f, fullSeconds));
        display.color = remain <= 10f
            ? new Color32(187, 50, 32, 255)
            : new Color32(80, 42, 24, 255);
    }
}

[DisallowMultipleComponent]
public sealed class RK58EnableMultitouch : MonoBehaviour
{
    void Awake()
    {
#if ENABLE_LEGACY_INPUT_MANAGER
        Input.multiTouchEnabled = true;
#endif
    }
    // Gameplay04IngredientNoteVisual already handles one pointerId PER NOTE.
    // Let EventSystem send the two touches separately. Do not simulate
    // extra pointer events or this can score a note more than once.
}

[Serializable]
public sealed class RK58MidiNote
{
    public float time;
    public float duration;
    public int pitch;
    public int velocity;
    public int channel;
    public int track;
}

[Serializable]
public sealed class RK58MidiChart
{
    public string midiName;
    public int ticksPerQuarter;
    public List<RK58MidiNote> notes = new List<RK58MidiNote>();
}

[Serializable]
public sealed class RK58SongEntry
{
    public string name;
    public AudioClip fullAudio;
    public TextAsset midiChartJson;
}

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
