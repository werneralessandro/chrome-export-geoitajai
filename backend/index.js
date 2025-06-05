const fs = require("fs");
const fsPromises = require("fs/promises");
const Papa = require("papaparse");
const puppeteer = require("puppeteer");
const path = require("path");
const pdfParse = require("pdf-parse");
const https = require('https');

// Configurações de diretórios
const CSV_PATH = path.resolve(__dirname, "./uploads/enderecos_completo.csv");
const OUTPUT_DIR = path.resolve(__dirname, "./outputs");
const TEMP_DIR = path.resolve(__dirname, "./temp");
const RESULT_CSV = path.join(OUTPUT_DIR, "resultados_cnd.csv");
const PDF_DIR = path.join(OUTPUT_DIR, "pdfs");
const URL_CND = "https://iss.itajai.sc.gov.br/sefaz/jsp/cnd/index.jsp";

// Criar diretórios se não existirem
async function setupDirectories() {
  await fsPromises.mkdir(OUTPUT_DIR, { recursive: true });
  await fsPromises.mkdir(TEMP_DIR, { recursive: true });
  await fsPromises.mkdir(PDF_DIR, { recursive: true });
}

// Função para baixar PDF diretamente
async function downloadPDF(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, { rejectUnauthorized: false }, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => reject(err));
    });
  });
}

// Função para extrair texto do PDF
async function extractPDFText(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Erro ao extrair texto do PDF:', error);
    return null;
  }
}

// Função para extrair dados do texto do PDF - CORRIGIDA
function extractDataFromPDFText(text) {
  if (!text) return null;

  // Extrair CPF/CNPJ - procura pelo padrão "CPF/CNPJ:" seguido do número
  const cpfCnpjMatch = text.match(/CPF\/CNPJ:\s*([^\n]+)/i);
  const cpfCnpj = cpfCnpjMatch ? cpfCnpjMatch[1].trim() : '';

  // Extrair proprietário - procura pelo padrão "PROPRIETÁRIO:" seguido do nome
  const proprietarioMatch = text.match(/PROPRIETÁRIO:\s*([^\n]+)/i);
  const proprietario = proprietarioMatch ? proprietarioMatch[1].trim() : '';

  // Extrair endereço - procura pelo padrão "ENDEREÇO/LOCALIZAÇÃO DO IMÓVEL:" seguido dos dados
  const enderecoMatch = text.match(/ENDEREÇO\/LOCALIZAÇÃO DO IMÓVEL:[\s\S]*?Logradouro:\s*([^\n]+)/i);
  const endereco = enderecoMatch ? enderecoMatch[1].trim() : '';

  // Extrair código do imóvel
  const codigoImovelMatch = text.match(/Código do Imóvel:\s*([^\n]+)/i);
  const codigoImovel = codigoImovelMatch ? codigoImovelMatch[1].trim() : '';

  // Como é uma certidão negativa, definimos situação como "Sem débitos"
  const situacao = "Sem débitos";

  return {
    situacao,
    proprietario,
    cnpj: cpfCnpj,
    endereco,
    codigoImovel
  };
}

// Processamento principal
(async () => {
  try {
    await setupDirectories();

    // Ler arquivo CSV
    const file = fs.readFileSync(CSV_PATH, "utf8");
    const { data } = Papa.parse(file, { header: true, skipEmptyLines: true });

    if (!data.length) {
      console.error("❌ Nenhum dado encontrado no CSV de entrada.");
      return;
    }

    console.log(`📥 Total de registros lidos: ${data.length}`);

    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const resultados = [];
    let pdfUrls = []; // Para armazenar URLs de PDF capturadas

    // Configurar interceptação de requisições para capturar URLs de PDF
    await page.setRequestInterception(true);
    page.on('request', (request) => request.continue());
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('Modelo09Imobiliario')) {
        pdfUrls.push(url);
      }
    });

    for (let i = 0; i < data.length; i++) {
      const codigoImovel = data[i].ncodimov?.trim();
      if (!codigoImovel) {
        console.warn(`⚠️ Código do imóvel ausente na linha ${i + 1}. Ignorando.`);
        continue;
      }

      console.log(`🔎 Processando código ${codigoImovel} (${i + 1}/${data.length})...`);
      pdfUrls = []; // Resetar URLs capturadas para cada iteração

      try {
        // Navegação e preenchimento do formulário
        await page.goto(URL_CND, { waitUntil: "networkidle2", timeout: 30000 });
        await page.waitForSelector("form#inicio", { timeout: 10000 });

        await page.select("select[name='finalidade']", "2");
        await page.evaluate(() => (document.querySelector("input[name='inscricao']").value = ""));
        await page.type("input[name='inscricao']", codigoImovel, { delay: 30 });

        // Submeter formulário sem esperar navegação
        await page.click("input[type='submit'][value='Pesquisar']");

        // Esperar até que a URL do PDF seja capturada ou timeout
        await new Promise(resolve => {
          const checkInterval = setInterval(() => {
            if (pdfUrls.length > 0) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 500);
          
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 15000);
        });

        if (pdfUrls.length > 0) {
          const pdfUrl = pdfUrls[0];
          const pdfPath = path.join(PDF_DIR, `certidao_${codigoImovel}_${Date.now()}.pdf`);

          console.log(`📄 PDF gerado para ${codigoImovel}, baixando...`);
          await downloadPDF(pdfUrl, pdfPath);

          // Extrair dados do PDF
          const pdfText = await extractPDFText(pdfPath);
          const pdfData = extractDataFromPDFText(pdfText);

          resultados.push({
            codigoImovel,
            ...data[i],
            ...pdfData,
            fonte: 'PDF',
            pdfPath: path.relative(OUTPUT_DIR, pdfPath)
          });

          console.log(`✅ PDF processado para código ${codigoImovel}`);
        } else {
          console.log("ℹ️ PDF não gerado, extraindo dados da página HTML...");
          
          // Extração de dados da página HTML (código existente)
          const dados = await page.evaluate(() => {
            const getValorPorLabel = (possibleLabels) => {
              const elementos = Array.from(document.querySelectorAll('td'));
              for (const label of possibleLabels) {
                const elementoLabel = elementos.find(el => 
                  el.textContent.trim().toLowerCase().includes(label.toLowerCase())
                );
                if (elementoLabel) {
                  const linha = elementoLabel.closest('tr');
                  if (linha) {
                    const celulas = linha.querySelectorAll('td');
                    if (celulas.length > 1) {
                      return celulas[1].textContent.trim();
                    }
                  }
                }
              }
              return "";
            };

            return {
              situacao: getValorPorLabel(["Situação do imóvel", "Situação", "Status"]),
              proprietario: getValorPorLabel(["Proprietário", "Responsável", "Titular"]),
              cnpj: getValorPorLabel(["CPF/CNPJ", "CNPJ/CPF", "Documento", "CPF", "CNPJ"])
            };
          });

          resultados.push({
            codigoImovel,
            ...data[i],
            ...dados,
            fonte: 'HTML'
          });

          console.log(`✅ Dados HTML capturados para código ${codigoImovel}`);
        }

        // Intervalo entre requisições
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Erro ao processar código ${codigoImovel}:`, error.message);
        resultados.push({
          codigoImovel,
          ...data[i],
          situacao: "ERRO",
          proprietario: "ERRO",
          cnpj: "ERRO",
          erro: error.message
        });
      }
    }

    await browser.close();

    // Salvar resultados em CSV
    if (resultados.length > 0) {
      const csvFinal = Papa.unparse(resultados);
      await fsPromises.writeFile(RESULT_CSV, csvFinal, "utf8");
      console.log(`✅ CSV final salvo em: ${RESULT_CSV}`);
      console.log(`📊 Total de resultados coletados: ${resultados.length}`);
    } else {
      console.warn("⚠️ Nenhum resultado foi coletado.");
    }

  } catch (err) {
    console.error("❌ Erro geral:", err);
  }
})();