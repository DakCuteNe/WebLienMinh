#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class RK58MidiImporter
{
    const string MENU = "Tools/Rhythm Kitchen/UI58 - Timer + 2 Fingers/";
    const string OUT = "Assets/_Project/Resources/UI58/MidiCharts";

    [MenuItem(MENU + "03 - Import Full + MIDI Pairs")]
    public static void Import()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode) return;
        int count = ImportAll();
        EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
        EditorUtility.DisplayDialog("RK58 - Full + MIDI",
            "Imported " + count + " matching Full/MIDI pairs.\n\n" +
            "Converted MIDI timestamp data is available in RK58_SongBank.\n" +
            "Connect this chart to your NoteSpawner's existing NoteChart API.",
            "OK");
    }

    static IEnumerable<T> InScene<T>() where T : Component
    {
        return SceneManager.GetActiveScene().GetRootGameObjects()
            .SelectMany(x => x.GetComponentsInChildren<T>(true));
    }

    static string SongKey(string s)
    {
        return s.ToLowerInvariant().Replace("_full", "").Replace("-full", "")
            .Replace(" full", "").Replace("_midi", "").Replace("-midi", "")
            .Replace(" midi", "").Replace("_", "").Replace("-", "").Replace(" ", "");
    }

    public static int ImportAll()
    {
        var music = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string guid in AssetDatabase.FindAssets("t:AudioClip"))
        {
            string path = AssetDatabase.GUIDToAssetPath(guid);
            string key = SongKey(Path.GetFileNameWithoutExtension(path));
            if (!music.ContainsKey(key)) music[key] = path;
        }

        string[] midiFiles = Directory.GetFiles(Application.dataPath,
            "*.mid", SearchOption.AllDirectories)
            .Concat(Directory.GetFiles(Application.dataPath,
                "*.midi", SearchOption.AllDirectories)).ToArray();

        Directory.CreateDirectory(OUT);
        var songs = new List<RK58SongEntry>();
        foreach (string file in midiFiles)
        {
            string name = Path.GetFileNameWithoutExtension(file);
            string audioPath;
            if (!music.TryGetValue(SongKey(name), out audioPath)) continue;

            try
            {
                RK58MidiChart chart = Convert(File.ReadAllBytes(file));
                chart.midiName = Path.GetFileName(file);
                string assetPath = "Assets" +
                    file.Substring(Application.dataPath.Length).Replace('\\', '/');
                string guid = AssetDatabase.AssetPathToGUID(assetPath);
                string suffix = guid.Length >= 8 ? guid.Substring(0, 8) : "unknown";
                string output = OUT + "/" + name + "_" + suffix + ".json";

                File.WriteAllText(output, JsonUtility.ToJson(chart, true));
                AssetDatabase.ImportAsset(output, ImportAssetOptions.ForceSynchronousImport);
                songs.Add(new RK58SongEntry {
                    name = name,
                    fullAudio = AssetDatabase.LoadAssetAtPath<AudioClip>(audioPath),
                    midiChartJson = AssetDatabase.LoadAssetAtPath<TextAsset>(output)
                });
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[RK58] Could not parse " + file + ": " + ex.Message);
            }
        }

        RK58SongBank bank = InScene<RK58SongBank>().FirstOrDefault();
        if (!bank)
        {
            GameObject go = new GameObject("RK58_SongBank");
            Undo.RegisterCreatedObjectUndo(go, "RK58 Create SongBank");
            bank = Undo.AddComponent<RK58SongBank>(go);
        }

        Undo.RecordObject(bank, "RK58 Import Full + MIDI Pairs");
        bank.songs = songs;

        if (!bank.conductorAudio)
        {
            AudioSource[] sources = InScene<AudioSource>().ToArray();
            bank.conductorAudio = sources.FirstOrDefault(s =>
                s.name.IndexOf("Conductor",
                    StringComparison.OrdinalIgnoreCase) >= 0);
            if (!bank.conductorAudio && sources.Length == 1)
                bank.conductorAudio = sources[0];
        }

        EditorUtility.SetDirty(bank);
        Debug.Log("[RK58] Imported " + songs.Count +
            " Full+MIDI pair(s). JSON is data only; existing NoteSpawner is unchanged.");
        return songs.Count;
    }

    sealed class Raw
    {
        public long first, last;
        public int note, velocity, channel, track;
    }
    sealed class Start
    {
        public long tick;
        public int velocity;
    }
    sealed class Tempo
    {
        public long tick;
        public int microseconds;
    }
    static int Word(byte[] b, int p)
    { return (b[p] << 8) | b[p + 1]; }
    static int DWord(byte[] b, int p)
    { return (b[p] << 24) | (b[p+1] << 16) | (b[p+2] << 8) | b[p+3]; }
    static int Variable(byte[] b, ref int p, int end)
    {
        int v = 0;
        for (int i = 0; i < 4; i++)
        {
            if (p >= end) throw new Exception("Truncated MIDI variable integer");
            int x = b[p++];
            v = (v << 7) | (x & 127);
            if ((x & 128) == 0) return v;
        }
        return v;
    }

    static RK58MidiChart Convert(byte[] data)
    {
        if (data.Length < 14 || data[0] != 77 || data[1] != 84 ||
            data[2] != 104 || data[3] != 100)
            throw new Exception("Not a Standard MIDI File");
        int headerSize = DWord(data, 4);
        int tracks = Word(data, 10);
        int ppq = Word(data, 12);
        if (headerSize < 6 || ppq == 0 || (ppq & 32768) != 0)
            throw new Exception("Unsupported MIDI timing format");

        int at = 8 + headerSize;
        var notes = new List<Raw>();
        var tempos = new List<Tempo> { new Tempo { tick=0, microseconds=500000 } };

        for (int track = 0; track < tracks; track++)
        {
            if (at + 8 > data.Length || data[at] != 77 ||
                data[at+1] != 84 || data[at+2] != 114 || data[at+3] != 107)
                throw new Exception("Missing MTrk chunk");

            int length = DWord(data, at + 4), p = at + 8, end = p + length;
            if (length < 0 || end > data.Length)
                throw new Exception("Invalid track byte count");
            at = end;
            long ticks = 0;
            int running = 0;
            var active = new Dictionary<int, Stack<Start>>();

            while (p < end)
            {
                ticks += Variable(data, ref p, end);
                if (p >= end) break;

                int status = data[p];
                if ((status & 128) != 0)
                {
                    p++;
                    if (status < 240) running = status;
                }
                else
                {
                    status = running;
                    if (status == 0) throw new Exception("Invalid running status");
                }

                if (status == 255)
                {
                    if (p >= end) break;
                    int metaType = data[p++];
                    int count = Variable(data, ref p, end);
                    if (count < 0 || p + count > end)
                        throw new Exception("Truncated meta event");
                    if (metaType == 81 && count == 3)
                        tempos.Add(new Tempo { tick=ticks,
                            microseconds=(data[p] << 16) |
                                (data[p+1] << 8) | data[p+2] });
                    p += count;
                    continue;
                }

                if (status == 240 || status == 247)
                {
                    int count = Variable(data, ref p, end);
                    if (count < 0 || p + count > end)
                        throw new Exception("Truncated SysEx");
                    p += count;
                    continue;
                }

                int kind = status & 240;
                int channel = status & 15;
                int fields = kind == 192 || kind == 208 ? 1 : 2;
                if (p + fields > end) throw new Exception("Truncated MIDI event");
                int pitch = data[p++];
                int vel = fields == 2 ? data[p++] : 0;
                if (kind != 128 && kind != 144) continue;

                int key = channel * 128 + pitch;
                Stack<Start> stack;
                if (!active.TryGetValue(key, out stack))
                {
                    stack = new Stack<Start>();
                    active[key] = stack;
                }
                if (kind == 144 && vel > 0)
                    stack.Push(new Start { tick=ticks, velocity=vel });
                else if (stack.Count > 0)
                {
                    Start first = stack.Pop();
                    notes.Add(new Raw { first=first.tick, last=ticks,
                        note=pitch, velocity=first.velocity,
                        channel=channel, track=track });
                }
            }
        }

        tempos = tempos.OrderBy(x => x.tick).ToList();
        RK58MidiChart chart = new RK58MidiChart { ticksPerQuarter=ppq };
        foreach (Raw n in notes)
        {
            double begin = ToSeconds(n.first, tempos, ppq);
            double finish = ToSeconds(n.last, tempos, ppq);
            chart.notes.Add(new RK58MidiNote {
                time=(float)begin, duration=(float)Math.Max(0, finish-begin),
                pitch=n.note, velocity=n.velocity,
                channel=n.channel, track=n.track
            });
        }
        chart.notes.Sort((a,b) => a.time.CompareTo(b.time));
        return chart;
    }

    static double ToSeconds(long ticks, List<Tempo> tempos, int ppq)
    {
        double seconds = 0d;
        long prev = 0;
        int microseconds = 500000;
        foreach (Tempo t in tempos)
        {
            if (t.tick > ticks) break;
            if (t.tick > prev)
                seconds += (t.tick - prev) * microseconds / (ppq * 1000000d);
            prev = t.tick;
            microseconds = t.microseconds;
        }
        return seconds + (ticks - prev) * microseconds / (ppq * 1000000d);
    }
}
#endif
