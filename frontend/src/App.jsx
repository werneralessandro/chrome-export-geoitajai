// Novo layout com integração backend para consulta CPF do proprietário via CSV

import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Snackbar,
  Alert,
  CircularProgress,
  LinearProgress,
  Chip,
  Paper,
  Grid,
} from '@mui/material';
import { DropzoneAreaBase } from 'mui-file-dropzone';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import * as XLSX from 'xlsx';

export default function CSVToXLSXConverter() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const appendLog = (msg) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const handleSubmit = () => {
    setLoading(true);
    setLogs([]);
    setProgress(10);
    appendLog('Enviando CSV para o servidor...');

    const reader = new FileReader();

    const processContent = async (csvContent) => {
      try {
        const response = await fetch('/api/extrair-cpf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: csvContent })
        });

        if (!response.ok) throw new Error('Erro na requisição ao servidor');

        const result = await response.json();
        if (!result.csv) throw new Error('Resposta do servidor inválida.');

        appendLog('Resposta recebida. Gerando XLSX...');
        setProgress(80);

        const csvRows = result.csv.trim().split('\n');
        const headers = csvRows[0].split(',');
        const data = csvRows.slice(1).map(row => {
          const cols = row.split(',');
          return Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
        });

        const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Imoveis');
        XLSX.writeFile(workbook, 'imoveis_com_cpfs.xlsx');

        appendLog('Arquivo XLSX gerado com sucesso.');
        setSnackbar({ open: true, message: 'Arquivo Excel gerado com sucesso!', severity: 'success' });
        setProgress(100);
      } catch (err) {
        appendLog('Erro: ' + err.message);
        setSnackbar({ open: true, message: err.message, severity: 'error' });
      } finally {
        setLoading(false);
      }
    };

    if (file) {
      reader.onload = (e) => processContent(e.target.result);
      reader.readAsText(file);
    } else if (text.trim()) {
      processContent(text);
    } else {
      setSnackbar({ open: true, message: 'Nenhum conteúdo CSV fornecido.', severity: 'error' });
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#f7f7f7', minHeight: '100vh', width: '100vw', boxSizing: 'border-box' }}>
      <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ color: '#000000' }}>
        Conversor CSV com dados de imóveis
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField
            label="Cole os dados CSV aqui"
            multiline
            rows={3}
            fullWidth
            value={text}
            onChange={(e) => setText(e.target.value)}
            sx={{ mb: 2, backgroundColor: 'white', color: '#000000' }}
          />

          <Box sx={{ width: '100%', mb: 1, minHeight: '60px' }}>
            <DropzoneAreaBase
              acceptedFiles={['.csv']}
              dropzoneText="Arraste o CSV para cá"
              onAdd={(newFiles) => setFile(newFiles[0].file)}
              onDelete={() => setFile(null)}
              showPreviews={false}
              filesLimit={1}
            />
          </Box>

          {file && (
            <Chip
              icon={<AttachFileIcon />}
              label={file.name}
              onDelete={() => setFile(null)}
              sx={{ mb: 0, padding: 0 }}
            />
          )}

          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={loading}
            startIcon={loading && <CircularProgress size={20} />}
            sx={{ my: 1 }}
          >
            {loading ? 'Processando...' : 'Processar e Exportar XLSX'}
          </Button>

          <Paper variant="outlined" sx={{ p: 2, height: 100, overflow: 'auto', backgroundColor: '#212121', color: '#00FF00', fontFamily: 'monospace', mb: 0 }}>
            {logs.length ? logs.map((line, i) => <Typography key={i}>{line}</Typography>) : 'Logs do processo'}
          </Paper>

          <Typography variant="body2" sx={{ mt: 1, color: '#000000' }}>Progresso: {progress}%</Typography>
          <LinearProgress variant="determinate" value={progress} sx={{ height: 10, borderRadius: 5 }} />
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, bgcolor: '#fff' }}>
            <Typography variant="h6" gutterBottom>
              Manual de Uso
            </Typography>
            <Typography variant="body2" gutterBottom>
              1. Cole os dados CSV no campo ou envie o arquivo CSV.
            </Typography>
            <Typography variant="body2" gutterBottom>
              2. Clique em "Processar e Exportar XLSX" para enviar ao servidor.
            </Typography>
            <Typography variant="body2" gutterBottom>
              3. O backend fará a consulta dos proprietários e retornará o resultado.
            </Typography>
            <Typography variant="body2">
              4. O arquivo XLSX será baixado automaticamente com os dados atualizados.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
