import React, { useState, useEffect, useRef } from 'react';
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

export default function CSVToXLSXConverter() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const logsEndRef = useRef(null);

  const [downloadXLSXLink, setDownloadXLSXLink] = useState(null);
  const [downloadCSVLink, setDownloadCSVLink] = useState(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/logs');

    eventSource.onmessage = (event) => {
      const message = event.data;
      setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);

      if (message.includes('Link XLSX:')) {
        const url = message.split('Link XLSX:')[1].trim();
        setDownloadXLSXLink(url);
      }

      if (message.includes('Link CSV:')) {
        const url = message.split('Link CSV:')[1].trim();
        setDownloadCSVLink(url);
      }
    };

    eventSource.onerror = () => {
      console.warn('Conexão com logs encerrada');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [logs]);

  const appendLog = (msg) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const handleSubmit = async () => {
    if (!file && !text.trim()) {
      setSnackbar({ open: true, message: 'Nenhum conteúdo CSV fornecido.', severity: 'error' });
      return;
    }

    setLoading(true);
    setLogs([]);
    setProgress(10);
    appendLog('Enviando CSV para o servidor...');

    try {
      const formData = new FormData();
      if (file) {
        formData.append('arquivo', file);
      } else {
        const blob = new Blob([text], { type: 'text/csv' });
        formData.append('arquivo', blob, 'dados.csv');
      }

      const response = await fetch('/api/processar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Erro na requisição ao servidor');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'imoveis_com_cpfs.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();

      appendLog('Arquivo CSV gerado com sucesso.');
      setSnackbar({ open: true, message: 'Arquivo Excel gerado com sucesso!', severity: 'success' });
      setProgress(100);
    } catch (err) {
      appendLog('Erro: ' + err.message);
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
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
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 1 }}>
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
            >
              {loading ? 'Processando...' : 'Processar'}
            </Button>

            {downloadXLSXLink && (
              <Button
                variant="outlined"
                color="success"
                href={downloadXLSXLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Baixar XLSX
              </Button>
            )}

            {downloadCSVLink && (
              <Button
                variant="outlined"
                color="secondary"
                href={downloadCSVLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Baixar CSV
              </Button>
            )}
          </Box>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              height: 100,
              overflowY: 'auto',
              backgroundColor: '#212121',
              color: '#00FF00',
              fontFamily: 'monospace',
              mb: 0,
            }}
          >
            {logs.length
              ? logs.map((line, i) => <Typography key={i}>{line}</Typography>)
              : 'Logs do processo'}
            <Box ref={logsEndRef} />
          </Paper>

          <Typography variant="body2" sx={{ mt: 1, color: '#000000' }}>
            Progresso: {progress}%
          </Typography>
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
