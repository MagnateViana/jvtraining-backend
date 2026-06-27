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
    const { objetivo, equipo, nivel, genero, nombre, edad, peso, notas, lang } = req.body;

    if (!objetivo || !nivel) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const langNames = { es: 'español', en: 'English', pt: 'português', fr: 'français' };
    const langOut = langNames[lang] || 'español';
    const generoLabel = genero === 'female' ? 'mujer' : genero === 'male' ? 'hombre' : 'persona';
    const ctx = nombre
      ? `Usuario: ${nombre} (${generoLabel}), ${edad || '?'} años, ${peso || '?'} kg. Lesiones: ${notas || 'ninguna'}.`
      : '';

    const prompt = `Eres un entrenador personal experto. Crea un plan de 6 días Push/Pull/Legs dos veces por semana.
${ctx}
Objetivo: ${objetivo}. Nivel: ${nivel}. Equipo: ${equipo || 'sin equipo'}.
Responde COMPLETAMENTE en ${langOut}. Nombres de ejercicios específicos para YouTube.
Estructura exacta:
- Día 1 Lunes: Pecho + Tríceps (Push A)
- Día 2 Martes: Espalda + Bíceps (Pull A)
- Día 3 Miércoles: Piernas + Glúteos (Legs A)
- Día 4 Jueves: Hombros + Tríceps (Push B)
- Día 5 Viernes: Espalda + Bíceps (Pull B)
- Día 6 Sábado: Piernas + Core (Legs B)
Responde SOLO JSON sin backticks:
{"titulo":"nombre plan","nivel":"${nivel}","objetivo":"${objetivo}","consejo":"consejo motivador","dias":[{"dia":"Día 1 — Lunes","grupo":"Pecho + Tríceps","tipo":"Push A","duracion":"50-60 min","ejercicios":[{"nombre":"ejercicio","series":4,"reps":"8-12","descanso":"90s","musculos":"músculo"}]}]}
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
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in response');

    let txt = rawTxt.slice(jsonStart, jsonEnd + 1)
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');

    const plan = JSON.parse(txt);
    res.json({ success: true, plan });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`JV Training server running on port ${PORT}`);
});
