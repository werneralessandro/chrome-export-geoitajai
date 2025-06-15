const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fsPromises = require("fs/promises");
const Papa = require("papaparse");
const puppeteer = require("puppeteer");
const path = require("path");
const pdfParse = require("pdf-parse");
const https = require("https");
const XLSX = require("xlsx");
const cors = require("cors");

const app = express();
const PORT = 3000;
const clients = [];

app.use(cors({ origin: "http://localhost" }));
app.use("/outputs", express.static(path.resolve(__dirname, "outputs")));

// SSE - Log para frontend
app.get("/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  clients.push(res);

  req.on("close", () => {
    clients.splice(clients.indexOf(res), 1);
  });
});

function sendLogToClients(message) {
  const formatted = typeof message === "string" ? message : JSON.stringify(message);
  clients.forEach((res) => res.write(`data: ${formatted}\n\n`));
}

function log(message) {
  console.log(message);
  sendLogToClients(message);
}

function errorLog(message) {
  console.error(message);
  sendLogToClients(`❌ ${message}`);
}

const OUTPUT_DIR = path.resolve(__dirname, "outputs");
const PDF_DIR = path.join(OUTPUT_DIR, "pdfs");
const URL_CND = "https://iss.itajai.sc.gov.br/sefaz/jsp/cnd/index.jsp";

const storage = multer.memoryStorage();
const upload = multer({ storage });

async function setupDirectories() {
  await fsPromises.mkdir(OUTPUT_DIR, { recursive: true });
  await fsPromises.mkdir(PDF_DIR, { recursive: true });
}

async function downloadPDF(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https
      .get(url, { rejectUnauthorized: false }, (response) => {
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => reject(err));
      });
  });
}

async function extractPDFText(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch {
    return null;
  }
}

function extractDataFromPDFText(text) {
  const cpfCnpjRaw = text.match(/CPF\/CNPJ:\s*([^\n]+)/i)?.[1].trim() ?? "";
  return {
    "cpf/cnpj": formatarCpfCnpj(cpfCnpjRaw),
  };
}

async function extractFromPage(page) {
  return await page.evaluate(() => {
    const getValorPorLabel = (labels) => {
      const tds = Array.from(document.querySelectorAll("td"));
      for (const label of labels) {
        const el = tds.find((td) =>
          td.textContent.trim().toLowerCase().includes(label.toLowerCase())
        );
        if (el) {
          const row = el.closest("tr");
          if (row) {
            const cells = row.querySelectorAll("td");
            if (cells.length > 1) return cells[1].textContent.trim();
          }
        }
      }
      return "";
    };
    const raw = getValorPorLabel(["CPF", "CNPJ", "CPF/CNPJ"]);
    return { "cpf/cnpj": raw };
  });
}

function formatarCpfCnpj(valor) {
  const digits = valor.replace(/\D/g, "");
  if (digits.length === 11)
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14)
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return digits;
}

app.post("/processar", upload.single("arquivo"), async (req, res) => {
  try {
    await setupDirectories();
    log("📥 CSV recebido. Iniciando processamento...");

    const arquivos = await fsPromises.readdir(OUTPUT_DIR);
    for (const nome of arquivos) {
      if (nome.endsWith(".xlsx") || nome.endsWith(".csv")) {
        await fsPromises.unlink(path.join(OUTPUT_DIR, nome));
      }
    }

    const csvContent = req.file.buffer.toString("utf8");
    const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

    if (!data.length) {
      errorLog("❌ CSV vazio.");
      return res.status(400).send("CSV vazio.");
    }

    const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    let pdfUrls = [];

    page.on("request", (req) => req.continue());
    page.on("response", async (resp) => {
      const url = resp.url();
      if (url.includes("Modelo09Imobiliario")) {
        pdfUrls.push(url);
      }
    });

    const resultados = [];
    const razaoCache = {};

    for (let i = 0; i < data.length; i++) {
      const codigoImovel = data[i].ncodimov?.trim();
      const razaoSocial = data[i].nrazaoso?.trim();

      if (!codigoImovel) continue;

      if (razaoSocial && razaoCache[razaoSocial]) {
        log(`🔁 Cache: ${razaoSocial} => ${razaoCache[razaoSocial]}`);
        resultados.push({
          ...data[i],
          "cpf/cnpj": razaoCache[razaoSocial],
        });
        continue;
      }

      log(`🔍 Buscando código: ${codigoImovel}`);
      pdfUrls = [];

      try {
        await page.goto(URL_CND, { waitUntil: "networkidle2", timeout: 30000 });
        await page.waitForSelector("form#inicio", { timeout: 10000 });

        await page.select("select[name='finalidade']", "2");
        await page.evaluate(() => (document.querySelector("input[name='inscricao']").value = ""));
        await page.type("input[name='inscricao']", codigoImovel, { delay: 30 });
        await page.click("input[type='submit'][value='Pesquisar']");

        await new Promise((resolve) => {
          const interval = setInterval(() => {
            if (pdfUrls.length > 0) {
              clearInterval(interval);
              resolve();
            }
          }, 500);
          setTimeout(() => {
            clearInterval(interval);
            resolve();
          }, 15000);
        });

        if (pdfUrls.length > 0) {
          const pdfUrl = pdfUrls[0];
          const pdfPath = path.join(PDF_DIR, `certidao_${codigoImovel}_${Date.now()}.pdf`);
          await downloadPDF(pdfUrl, pdfPath);
          log(`📄 PDF: ${codigoImovel}`);

          const text = await extractPDFText(pdfPath);
          const extra = extractDataFromPDFText(text);
          log(`✅ PDF CPF/CNPJ: ${extra["cpf/cnpj"]}`);

          await fsPromises.unlink(pdfPath);

          resultados.push({
            ...data[i],
            ...extra,
          });

          if (razaoSocial && extra["cpf/cnpj"]) {
            razaoCache[razaoSocial] = extra["cpf/cnpj"];
          }
        } else {
          const extra = await extractFromPage(page);
          log(`⚠️ Sem PDF. Buscando via HTML...`);
          log(`✅ HTML CPF/CNPJ: ${extra["cpf/cnpj"]}`);

          const cpfFormatado = formatarCpfCnpj(extra["cpf/cnpj"]);

          resultados.push({
            ...data[i],
            "cpf/cnpj": cpfFormatado,
          });

          if (razaoSocial && cpfFormatado) {
            razaoCache[razaoSocial] = cpfFormatado;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        errorLog(`Erro código ${codigoImovel}: ${err.message}`);
        resultados.push({
          ...data[i],
          "cpf/cnpj": "ERRO",
        });
      }
    }

    await browser.close();
    log("📦 Processamento finalizado. Exportando...");

    const timestamp = Date.now();
    const nomeArquivoXLSX = `resultados_${timestamp}.xlsx`;
    const nomeArquivoCSV = `resultados_${timestamp}.csv`;

    const caminhoXLSX = path.join(OUTPUT_DIR, nomeArquivoXLSX);
    const caminhoCSV = path.join(OUTPUT_DIR, nomeArquivoCSV);

    // XLSX
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(resultados);
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, caminhoXLSX);

    log(`🔗 Link XLSX: http://localhost/api/outputs/${nomeArquivoXLSX}`);

    // CSV
    const csvFinal = Papa.unparse(resultados);
    await fsPromises.writeFile(caminhoCSV, csvFinal, "utf8");

    log(`🔗 Link CSV: http://localhost/api/outputs/${nomeArquivoCSV}`);
    log(`📥 Enviando CSV para download automático...`);

    res.download(caminhoCSV, "resultados.csv", (err) => {
      if (err) {
        errorLog("❌ Erro no download automático. Baixe manual pelo link acima.");
      }
    });
  } catch (err) {
    errorLog("Erro interno: " + err.message);
    res.status(500).send("Erro interno");
  }
});

app.listen(PORT, () => {
  log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
