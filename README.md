# 📍 Exportador de Dados da Planta Cadastral de Itajaí/SC

 Este script foi desenvolvido para facilitar a extração de informações da **Planta Cadastral de Itajaí/SC**, permitindo que usuários realizem o download dos dados exibidos no mapa, diretamente pelo navegador.


## 🌐 Acesso à Planta Cadastral

  🔗 [https://geoitajai.github.io/geo/plantacadastral.html](https://geoitajai.github.io/geo/plantacadastral.html)


## ⚙️ Como Utilizar

 Siga os passos abaixo para exportar os dados:

  1. Acesse o link acima e selecione a área desejada no mapa (terreno). Uma tabela com informações será exibida na parte inferior da tela.
   
  2. Pressione `F12` para abrir o **DevTools** do navegador Google Chrome.

  3. Na aba **Console**, digite o seguinte comando para liberar a funcionalidade de colar código:

     ```javascript
     allow pasting;

  4. Em seguida, cole o script abaixo no console e pressione Enter:

     ```javascript
     javascript:(function(){fetch("https://raw.githubusercontent.com/werneralessandro/chrome-export-geoitajai/refs/heads/main/chrome_export.js")
        .then(r => r.text())
        .then(eval);
     })();

## 📦 Sobre o Script

 O script está hospedado no GitHub e realiza a extração automática das informações da tabela visível.
 
 Nenhuma alteração é feita na página original — apenas a coleta e o download dos dados.

## ⚠️ Observações

 Utilize preferencialmente o Google Chrome para melhor compatibilidade.

 Certifique-se de que a tabela de informações está visível antes de executar o script.

 O uso deste script é de responsabilidade do usuário.

## 👤 Autor

 Alessandro Werner
 
 Licença: MIT
