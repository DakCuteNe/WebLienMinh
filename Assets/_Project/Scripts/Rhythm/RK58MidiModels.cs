using System;
using System.Collections.Generic;
using UnityEngine;

// DTOs only: intentionally NOT MonoBehaviours. Keep the MIDI model
// definitions out of RK58Runtime.cs because that file's GUID was
// serialized on GameObjects by older UI58 builds.
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
