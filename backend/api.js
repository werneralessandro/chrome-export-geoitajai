const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const router = express.Router();
const uploadDir = path.resolve(__dirname, 'uploads');
const backendScript = path.resolve(__dirname, 'index.js'); // seu script existente

router.post('/extrair-cpf', async (req, res) => {
  try {
    const csvContent = req.body.csv;
    if (!csvContent) return res.status(400).json({ message: 'CSV não enviado.' });

    const inputPath = path.join(uploadDir, 'enderecos_completo.csv');
    fs.writeFileSync(inputPath, csvContent, 'utf-8');

    exec(`node "${backendScript}"`, (error, stdout, stderr) => {
      if (error) return res.status(500).json({ message: stderr });

      const outputPath = path.resolve(__dirname, 'outputs/resultados_cnd.csv');
      if (!fs.existsSync(outputPath)) return res.status(500).json({ message: 'Arquivo de saída não encontrado.' });

      const result = fs.readFileSync(outputPath, 'utf-8');
      res.status(200).json({ csv: result });
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
