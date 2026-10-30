using UnityEngine;
using UnityEngine.UI;
using TMPro;

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

