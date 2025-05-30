(async function () {
  async function loadXlsxLib() {
    if (window.XLSX) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject('Falha ao carregar biblioteca XLSX');
      document.head.appendChild(script);
    });
  }

  function waitForTabulatorTable(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const table = window.Tabulator?.findTable(selector)?.[0];
        if (table) {
          clearInterval(interval);
          resolve(table);
        } else if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject("Tabela não encontrada no tempo limite.");
        }
      }, 300);
    });
  }

  try {
    const table = await waitForTabulatorTable("#tabelatabulator");
    const allData = await table.getData();

    if (!allData.length) {
      alert("Nenhum dado encontrado na tabela.");
      return;
    }

    const keys = Object.keys(allData[0]);
    const csvRows = [
      keys.join(","),
      ...allData.map(row =>
        keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',')
      )
    ];

    const csvContent = csvRows.join("\n");

    await loadXlsxLib();

    let container = document.getElementById("csv-export-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "csv-export-container";
      container.style.position = "fixed";
      container.style.top = "10px";
      container.style.left = "10px";
      container.style.right = "10px";
      container.style.bottom = "10px";
      container.style.backgroundColor = "white";
      container.style.border = "2px solid black";
      container.style.zIndex = 9999;
      container.style.padding = "10px";
      container.style.overflow = "auto";

      const buttonsDiv = document.createElement("div");
      buttonsDiv.style.marginBottom = "10px";
      buttonsDiv.style.display = "flex";
      buttonsDiv.style.gap = "10px";

      const btnCopy = document.createElement("button");
      btnCopy.textContent = "Copiar CSV";
      btnCopy.onclick = () => {
        const textarea = document.getElementById("csv-export-textarea");
        textarea.select();
        try {
          const successful = document.execCommand('copy');
          alert(successful ? 'CSV copiado para a área de transferência!' : 'Falha ao copiar.');
        } catch {
          alert('Falha ao copiar.');
        }
      };
      buttonsDiv.appendChild(btnCopy);

      const btnDownload = document.createElement("button");
      btnDownload.textContent = "Download CSV";
      btnDownload.onclick = () => {
        try {
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'enderecos_completo.csv';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }, 100);
        } catch (e) {
          alert('Erro ao gerar download CSV: ' + e.message);
        }
      };
      buttonsDiv.appendChild(btnDownload);

      const btnDownloadXlsx = document.createElement("button");
      btnDownloadXlsx.textContent = "Download XLSX";
      btnDownloadXlsx.onclick = () => {
        try {
          const worksheet = XLSX.utils.json_to_sheet(allData);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "Planilha1");
          // Para forçar download usando writeFile com callback (em alguns casos funciona melhor)
          XLSX.writeFile(workbook, "enderecos_completo.xlsx");
        } catch (e) {
          alert("Erro ao gerar arquivo XLSX: " + e.message);
        }
      };
      buttonsDiv.appendChild(btnDownloadXlsx);

      const btnClose = document.createElement("button");
      btnClose.textContent = "Fechar";
      btnClose.onclick = () => container.remove();
      buttonsDiv.appendChild(btnClose);

      container.appendChild(buttonsDiv);

      const textarea = document.createElement("textarea");
      textarea.style.width = "100%";
      textarea.style.height = "85%";
      textarea.style.whiteSpace = "pre";
      textarea.id = "csv-export-textarea";
      container.appendChild(textarea);

      document.body.appendChild(container);
    }

    const textarea = document.getElementById("csv-export-textarea");
    textarea.value = csvContent;

    alert("CSV gerado! Use os botões para copiar ou baixar.");
  } catch (error) {
    console.error("Erro ao extrair dados da tabela:", error);
    alert("Erro ao tentar extrair a tabela: " + error);
  }
})();
