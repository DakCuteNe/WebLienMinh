#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using TMPro;

public static class RK58SceneFixEditor
{
    const string MENU = "Tools/Rhythm Kitchen/UI58 - Timer + 2 Fingers/";
    const string FOLDER = "Assets/_Project/Art/UI58";

    [MenuItem(MENU + "01 - Fix Timer + Enable Two Fingers")]
    public static void Apply()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            EditorUtility.DisplayDialog("UI58", "Hay thoat Play Mode.", "OK");
            return;
        }

        Canvas.ForceUpdateCanvases();
        bool timer = FixTimer();
        EnableTouch();
        EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
        EditorUtility.DisplayDialog("Rhythm Kitchen UI58",
            "Timer: " + (timer ? "DA SUA" : "KHONG TIM THAY") +
            "\nChoi 2 ngon: DA BAT" +
            "\n\nCtrl + S de luu Scene. Test tren may cam ung.",
            "OK");
    }

    [MenuItem(MENU + "02 - Diagnose Timer")]
    public static void Diagnose()
    {
        TMP_Text tmp; Text legacy;
        RectTransform root = FindTimer(out tmp, out legacy);
        Debug.Log("[UI58] Timer root: " + (root ? root.name : "NOT FOUND"));
        Debug.Log("[UI58] Source: " + (tmp ? tmp.name : legacy ? legacy.name : "NOT FOUND"));
    }

    static System.Collections.Generic.IEnumerable<T> InScene<T>() where T : Component
    {
        return SceneManager.GetActiveScene().GetRootGameObjects()
            .SelectMany(go => go.GetComponentsInChildren<T>(true));
    }

    static bool IsMMSS(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return false;
        string[] a = s.Trim().Split(':');
        int m, sec;
        return a.Length == 2 && int.TryParse(a[0], out m) &&
            int.TryParse(a[1], out sec) && m >= 0 && sec >= 0 && sec <= 59;
    }

    static RectTransform ParentFrame(Transform child)
    {
        RectTransform fallback = null;
        for (Transform t = child.parent; t && !t.GetComponent<Canvas>(); t = t.parent)
        {
            RectTransform r = t as RectTransform;
            if (!r || !r.GetComponent<Image>()) continue;
            float w = r.rect.width, h = r.rect.height;
            if (w < 175f || w > 1500f || h < 25f ||
                h > 175f || w < h * 2.3f) continue;
            string n = t.name.ToLowerInvariant();
            if (n.Contains("timer") || n.Contains("clock") || n.Contains("timebar"))
                return r;
            if (!fallback) fallback = r;
        }
        return fallback;
    }

    static RectTransform FindTimer(out TMP_Text tmp, out Text legacy)
    {
        tmp = null; legacy = null;
        foreach (TMP_Text t in InScene<TMP_Text>()
            .OrderByDescending(x => x.gameObject.activeInHierarchy))
        {
            if (t.name.StartsWith("RK58_") || !IsMMSS(t.text)) continue;
            RectTransform root = ParentFrame(t.transform);
            if (root) { tmp = t; return root; }
        }
        foreach (Text t in InScene<Text>())
        {
            if (!IsMMSS(t.text)) continue;
            RectTransform root = ParentFrame(t.transform);
            if (root) { legacy = t; return root; }
        }
        return null;
    }

    static bool FixTimer()
    {
        TMP_Text source;
        Text legacy;
        RectTransform root = FindTimer(out source, out legacy);
        if (!root) { Debug.LogWarning("[UI58] Timer frame not found."); return false; }

        Sprite pill = CreatePill();
        Sprite clockSprite = CreateClock();
        if (!pill || !clockSprite) return false;

        float w = root.rect.width, h = root.rect.height;
        float pad = Mathf.Clamp(h * .13f, 5f, 13f);
        float iconSize = h * .69f;
        float numberWidth = Mathf.Clamp(w * .23f, 65f, 120f);
        float barX = pad * 2.5f + iconSize;
        float barW = Mathf.Max(45f, w - barX - numberWidth - pad * 2.2f);
        float barH = Mathf.Clamp(h * .3f, 10f, 27f);

        // Hide only old clock and bar graphics. The actual timer remains intact.
        foreach (Image i in root.GetComponentsInChildren<Image>(true))
        {
            if (i.transform == root || i.name.StartsWith("RK58_")) continue;
            string n = i.name.ToLowerInvariant();
            if (n.Contains("timerfill") || n.Contains("timefill") ||
                n.Contains("timerbar") || n.Contains("timebar") ||
                n.Contains("clockicon") || n.Contains("timericon") ||
                n.Contains("stopwatch") || n.StartsWith("ui57_"))
            {
                Undo.RecordObject(i, "UI58 Hide Legacy Timer Art");
                i.enabled = false;
            }
        }

        Image icon = GetImage(root, "RK58_GoldenClock");
        icon.sprite = clockSprite;
        icon.type = Image.Type.Simple;
        icon.color = Color.white;
        icon.preserveAspect = true;
        icon.raycastTarget = false;
        Place(icon.rectTransform,
            new Vector2(0, .5f), new Vector2(.5f, .5f),
            new Vector2(iconSize, iconSize), new Vector2(pad + iconSize / 2f, 0));

        Image track = GetImage(root, "RK58_DarkTrack");
        track.sprite = pill;
        track.type = Image.Type.Sliced;
        track.color = new Color32(9, 78, 80, 255);
        track.raycastTarget = false;
        Place(track.rectTransform,
            new Vector2(0, .5f), new Vector2(0, .5f),
            new Vector2(barW, barH), new Vector2(barX, 0));

        Image fill = GetImage(track.rectTransform, "RK58_MintFill");
        fill.sprite = pill;
        fill.type = Image.Type.Filled;
        fill.fillMethod = Image.FillMethod.Horizontal;
        fill.fillOrigin = (int)Image.OriginHorizontal.Left;
        fill.fillAmount = 1f;
        fill.color = new Color32(116, 235, 217, 255);
        fill.raycastTarget = false;
        Place(fill.rectTransform,
            new Vector2(.5f, .5f), new Vector2(.5f, .5f),
            new Vector2(barW, barH), Vector2.zero);

        TextMeshProUGUI timerText = GetTMP(root, "RK58_TimeText");
        if (source && source.font) timerText.font = source.font;
        else if (!timerText.font && TMP_Settings.defaultFontAsset)
            timerText.font = TMP_Settings.defaultFontAsset;

        timerText.text = source ? source.text : legacy ? legacy.text : "01:00";
        timerText.alignment = TextAlignmentOptions.Center;
        timerText.enableAutoSizing = true;
        timerText.fontSizeMin = 14;
        timerText.fontSizeMax = Mathf.Clamp(h * .49f, 20f, 32f);
        timerText.fontStyle = FontStyles.Bold;
        timerText.textWrappingMode = TextWrappingModes.NoWrap;
        timerText.overflowMode = TextOverflowModes.Truncate;
        timerText.raycastTarget = false;
        Place(timerText.rectTransform,
            new Vector2(1, .5f), new Vector2(1, .5f),
            new Vector2(numberWidth, h * .82f), new Vector2(-pad, 0));

        RK58TimerView component = root.GetComponent<RK58TimerView>();
        if (!component) component = Undo.AddComponent<RK58TimerView>(root.gameObject);
        Undo.RecordObject(component, "UI58 Link Existing Timer");
        component.sourceTMP = source;
        component.sourceLegacy = legacy;
        component.display = timerText;
        component.fill = fill;
        string[] parts = timerText.text.Split(':');
        int m, sec;
        if (parts.Length == 2 && int.TryParse(parts[0], out m) &&
            int.TryParse(parts[1], out sec))
            component.fullSeconds = Mathf.Max(60f, m * 60f + sec);

        if (source)
        { Undo.RecordObject(source, "UI58 Hide Old Number"); source.enabled = false; }
        if (legacy)
        { Undo.RecordObject(legacy, "UI58 Hide Old Number"); legacy.enabled = false; }

        icon.transform.SetAsLastSibling();
        track.transform.SetAsLastSibling();
        timerText.transform.SetAsLastSibling();

        EditorUtility.SetDirty(component);
        Debug.Log("[UI58] Timer patched on " + root.name);
        return true;
    }

    static void EnableTouch()
    {
        if (!InScene<RK58EnableMultitouch>().Any())
        {
            GameObject go = new GameObject("RK58_Multitouch");
            Undo.RegisterCreatedObjectUndo(go, "UI58 Enable Two Fingers");
            Undo.AddComponent<RK58EnableMultitouch>(go);
        }

        // Respect an EventSystem already configured for this project.
        if (!InScene<EventSystem>().Any())
        {
            GameObject eventObj = new GameObject("EventSystem", typeof(EventSystem));
            Undo.RegisterCreatedObjectUndo(eventObj, "UI58 Create EventSystem");
            Type module = Type.GetType(
                "UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
            if (module != null) eventObj.AddComponent(module);
            else eventObj.AddComponent<StandaloneInputModule>();
        }

        // DirectTouchSurface belongs behind the actual note hit targets.
        foreach (RectTransform rt in InScene<RectTransform>())
            if (rt.name == "Gameplay04DirectTouchSurface")
            {
                Undo.RecordObject(rt, "UI58 Note Touch Priority");
                rt.SetAsFirstSibling();
            }
    }

    static Image GetImage(Transform parent, string name)
    {
        Transform found = parent.Find(name);
        GameObject obj = found ? found.gameObject : new GameObject(name,
            typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        if (!found)
        { obj.transform.SetParent(parent, false); Undo.RegisterCreatedObjectUndo(obj, name); }
        Image img = obj.GetComponent<Image>();
        return img ? img : Undo.AddComponent<Image>(obj);
    }
    static TextMeshProUGUI GetTMP(Transform parent, string name)
    {
        Transform found = parent.Find(name);
        GameObject obj = found ? found.gameObject : new GameObject(name,
            typeof(RectTransform), typeof(CanvasRenderer), typeof(TextMeshProUGUI));
        if (!found)
        { obj.transform.SetParent(parent, false); Undo.RegisterCreatedObjectUndo(obj, name); }
        TextMeshProUGUI tmp = obj.GetComponent<TextMeshProUGUI>();
        return tmp ? tmp : Undo.AddComponent<TextMeshProUGUI>(obj);
    }
    static void Place(RectTransform r, Vector2 anchor, Vector2 pivot,
        Vector2 size, Vector2 offset)
    {
        Undo.RecordObject(r, "UI58 Timer Alignment");
        r.anchorMin = r.anchorMax = anchor; r.pivot = pivot;
        r.sizeDelta = size; r.anchoredPosition = offset;
        r.localScale = Vector3.one; r.localRotation = Quaternion.identity;
    }
    static Sprite CreatePill()
    {
        const string path = FOLDER + "/UI58_TimerPill.png";
        Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(path);
        if (s) return s;
        int w = 64, h = 32;
        Texture2D tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float a = Mathf.Abs(x + .5f - w / 2f) - (w / 2f - 15f);
                float b = Mathf.Abs(y + .5f - h / 2f) - (h / 2f - 15f);
                float d = Mathf.Sqrt(Mathf.Pow(Mathf.Max(0, a), 2) +
                    Mathf.Pow(Mathf.Max(0, b), 2)) + Mathf.Min(Mathf.Max(a, b), 0) - 15f;
                tex.SetPixel(x, y, new Color(1f, 1f, 1f, Mathf.Clamp01(.5f - d)));
            }
        return SaveSprite(tex, path, true);
    }
    static Sprite CreateClock()
    {
        foreach (string guid in AssetDatabase.FindAssets("cozy_golden_stopwatch_icon t:Sprite"))
        {
            Sprite found = AssetDatabase.LoadAssetAtPath<Sprite>(
                AssetDatabase.GUIDToAssetPath(guid));
            if (found) return found;
        }
        const string path = FOLDER + "/UI58_GoldClock.png";
        Sprite s = AssetDatabase.LoadAssetAtPath<Sprite>(path);
        if (s) return s;

        int n = 128;
        Texture2D tex = new Texture2D(n, n, TextureFormat.RGBA32, false);
        Vector2 center = new Vector2(0, -.1f);
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++)
            {
                Vector2 p = new Vector2((x + .5f) / n * 2f - 1f,
                    (y + .5f) / n * 2f - 1f);
                float d = Vector2.Distance(p, center);
                Color c = Color.clear;
                if (Mathf.Abs(p.x) < .21f && p.y > .58f && p.y < .88f)
                    c = new Color(1f, .63f, .17f);
                if (d < .8f)
                    c = d > .74f ? new Color(.29f, .12f, .04f) :
                        d > .63f ? new Color(1f, .65f, .20f) :
                        d > .58f ? new Color(.56f, .27f, .08f) :
                        new Color(1f, .96f, .81f);
                if (Mathf.Abs(p.x) < .033f && p.y > -.1f && p.y < .30f)
                    c = new Color(.34f, .13f, .05f);
                if (Vector2.Distance(p, center) < .075f)
                    c = new Color(.91f, .5f, .15f);
                tex.SetPixel(x, y, c);
            }
        return SaveSprite(tex, path, false);
    }
    static Sprite SaveSprite(Texture2D tex, string path, bool sliced)
    {
        Directory.CreateDirectory(FOLDER);
        File.WriteAllBytes(path, tex.EncodeToPNG());
        UnityEngine.Object.DestroyImmediate(tex);
        AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
        TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer)
        {
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.alphaIsTransparency = true;
            importer.mipmapEnabled = false;
            if (sliced) importer.spriteBorder = new Vector4(15, 12, 15, 12);
            importer.SaveAndReimport();
        }
        return AssetDatabase.LoadAssetAtPath<Sprite>(path);
    }
}
#endif
