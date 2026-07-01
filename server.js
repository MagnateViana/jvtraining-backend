const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'JV Training API running OK' });
});

app.post('/generate', async (req, res) => {
  try {
    const { objetivo, equipo, nivel, genero, nombre, edad, peso, notas, lang, variante, historial } = req.body;
    if (!objetivo || !nivel) return res.status(400).json({ error: 'Faltan datos requeridos' });

    const langNames = { es: 'español', en: 'English', pt: 'português', fr: 'français' };
    const langOut = langNames[lang] || 'español';
    const generoLabel = genero === 'female' ? 'mujer' : genero === 'male' ? 'hombre' : 'persona';
    const ctx = nombre ? `Usuario: ${nombre} (${generoLabel}), ${edad||'?'} años, ${peso||'?'} kg. Lesiones: ${notas||'ninguna'}.` : '';
    const variantCtx = variante ? `Variante #${variante} — usa ejercicios DIFERENTES a los habituales.` : '';
    const historialCtx = historial ? `Ejercicios recientes (EVÍTALOS o usa variantes): ${historial}` : '';

    const prompt = `Eres un entrenador personal experto. Crea un plan de 6 días Push/Pull/Legs.
${ctx}
${variantCtx}
${historialCtx}
Objetivo: ${objetivo}. Nivel: ${nivel}. Equipo: ${equipo || 'sin equipo'}.
IMPORTANTE: Responde COMPLETAMENTE en ${langOut}. USA SOLO JSON VÁLIDO, sin texto adicional, sin backticks, sin comentarios.
Estructura EXACTA:
{"titulo":"nombre plan","nivel":"${nivel}","objetivo":"${objetivo}","consejo":"consejo motivador","dias":[{"dia":"Día 1 — Lunes","grupo":"Pecho + Tríceps","tipo":"Push A","duracion":"50-60 min","ejercicios":[{"nombre":"ejercicio","series":4,"reps":"8-12","descanso":"90s","musculos":"músculo principal"}]}]}
Incluye exactamente 6 días, 5-6 ejercicios por día.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
    });

    if (!response.ok) throw new Error(`Anthropic API error ${response.status}`);
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    if (!data.content?.length) throw new Error('Empty response from AI');

    let txt = data.content.map(c => c.text || '').join('');
    txt = txt.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonStart = txt.indexOf('{');
    const jsonEnd = txt.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in response');
    txt = txt.slice(jsonStart, jsonEnd + 1)
      .replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
      .replace(/\n/g, ' ').replace(/\t/g, ' ');

    const plan = JSON.parse(txt);
    if (!plan.dias || !Array.isArray(plan.dias) || plan.dias.length === 0) throw new Error('Plan missing dias array');
    res.json({ success: true, plan });
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PEXELS VIDEO SEARCH ──────────────────────────────────────────────────────
app.get('/video', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query' });

    const PEXELS_KEY = process.env.PEXELS_API_KEY;
    if (!PEXELS_KEY) return res.status(500).json({ error: 'Pexels API key not configured' });

    const query = encodeURIComponent(q);
    const response = await fetch(
      `https://api.pexels.com/v1/videos/search?query=${query}&per_page=15&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY } }
    );

    if (!response.ok) throw new Error(`Pexels error: ${response.status}`);
    const data = await response.json();

    const videos = (data.videos || []).map(v => {
      const files = v.video_files || [];
      const hd = files.find(f => f.quality === 'hd' && f.file_type === 'video/mp4');
      const sd = files.find(f => f.quality === 'sd' && f.file_type === 'video/mp4');
      const best = hd || sd || files[0];
      return {
        id: v.id,
        url: best?.link || null,
        thumb: v.image,
        duration: v.duration,
        author: v.user?.name || 'Pexels',
        authorUrl: v.user?.url || 'https://www.pexels.com',
        pexelsUrl: v.url
      };
    }).filter(v => v.url);

    res.json({ success: true, videos });
  } catch (err) {
    console.error('Pexels error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`JV Training server running on port ${PORT}`));
