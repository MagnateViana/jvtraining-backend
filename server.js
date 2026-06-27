const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'JV Training API running ✅' });
});

// Generate workout route
app.post('/generate', async (req, res) => {
  try {
    const { objetivo, equipo, nivel, genero, nombre, edad, peso, notas, lang } = req.body;

    if (!objetivo || !nivel) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const langNames = { es: 'español', en: 'English', pt: 'português', fr: 'français' };
    const langOut = langNames[lang] || 'español';
    const generoLabel = genero === 'female' ? 'mujer' : genero === 'male' ? 'hombre' : 'persona';
    const ctx = nombre
      ? `Usuario: ${nombre} (${generoLabel}), ${edad || '?'} años, ${peso || '?'} kg. Lesiones: ${notas || 'ninguna'}. Adapta los ejercicios considerando su género.`
      : '';

    const prompt = `Eres un entrenador personal experto. Crea un plan de 6 días Push/Pull/Legs dos veces por semana.
${ctx}
Objetivo: ${objetivo}. Nivel: ${nivel}. Equipo: ${equipo || 'sin equipo'}.
IMPORTANTE: Responde COMPLETAMENTE en ${langOut}. Nombres de ejercicios específicos para buscar en YouTube.
Estructura:
- Día 1 Lunes: Pecho + Tríceps (Push A)
- Día 2 Martes: Espalda + Bíceps (Pull A)
- Día 3 Miércoles: Piernas + Glúteos (Legs A)
- Día 4 Jueves: Hombros + Tríceps (Push B — variaciones distintas)
- Día 5 Viernes: Espalda + Bíceps (Pull B — variaciones distintas)
- Día 6 Sábado: Piernas + Core (Legs B — variaciones distintas)
- Domingo: Descanso
Responde SOLO JSON sin backticks:
{"titulo":"nombre plan","nivel":"${nivel}","objetivo":"${objetivo}","consejo":"consejo motivador","dias":[{"dia":"Día 1 — Lunes","grupo":"Pecho + Tríceps","tipo":"Push A","duracion":"50-60 min","ejercicios":[{"nombre":"nombre","series":4,"reps":"8-12","descanso":"90s","musculos":"músculo"}]}]}
5-6 ejercicios por día.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const rawTxt = data.content.map(c => c.text || '').join('');
    const jsonStart = rawTxt.indexOf('{');
    const jsonEnd = rawTxt.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found');

    let txt = rawTxt.slice(jsonStart, jsonEnd + 1)
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');

    let plan;
    try {
      plan = JSON.parse(txt);
    } catch (e) {
      // Ask AI to fix the JSON
      const fixRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 3500,
          messages: [{ role: 'user', content: 'Fix this JSON so it is valid. Return ONLY the fixed JSON, no explanation, no backticks:\n' + txt }]
        })
      });
      const fixData = await fixRes.json();
      const fixTxt = fixData.content.map(c => c.text || '').join('').trim();
      plan = JSON.parse(fixTxt);
    }

    res.json({ success: true, plan });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Error generando rutina: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`JV Training server running on port ${PORT}`);
});
