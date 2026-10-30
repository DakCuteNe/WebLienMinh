using System;
using System.Collections.Generic;
using UnityEngine;

// Serialized MIDI data types only. Scene MonoBehaviours live in their own
// matching-name files so Unity can serialize m_Script links reliably.

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

