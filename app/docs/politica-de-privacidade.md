# Política de Privacidade — Komorebi

**Última atualização:** maio de 2025
**Versão:** 1.0.0

---

## 1. Introdução

Bem-vindo ao **Komorebi**, um aplicativo de câmera desenvolvido por **Fábio Santos** ("a Equipe Komorebi"). Esta Política de Privacidade explica quais informações são coletadas, como são utilizadas e quais direitos você tem em relação aos seus dados ao usar o aplicativo.

Ao usar o Komorebi, você concorda com as práticas descritas nesta política. Se não concordar, por favor, não utilize o aplicativo.

---

## 2. Informações que São Coletadas

### 2.1 Dados coletados diretamente no dispositivo

O Komorebi opera **localmente no seu dispositivo**. As seguintes informações são geradas e armazenadas exclusivamente no seu aparelho:

- **Fotos capturadas:** Todas as imagens tiradas pelo aplicativo são salvas no álbum "Komorebi" na sua galeria local.
- **Metadados EXIF:** Ao capturar uma foto, o app pode incorporar automaticamente metadados técnicos na imagem, incluindo:
  - Data e hora da captura
  - Configurações de câmera (ISO, abertura, velocidade do obturador, distância focal)
  - Modelo da lente utilizada
  - Informações de espaço de cores
- **Coordenadas GPS (opcional):** Se você autorizar e ativar a função de localização, as coordenadas geográficas no momento da captura (latitude, longitude e altitude) são incorporadas nos metadados EXIF da foto. **Esses dados são gravados apenas na imagem e nunca transmitidos a servidores externos pelo Komorebi.**

### 2.2 Preferências e configurações

As seguintes preferências são armazenadas localmente no seu dispositivo via `AsyncStorage` e nunca são enviadas a servidores externos:

- Estilo visual do viewfinder (retrô ou padrão)
- Visibilidade da grade de composição
- Ativação do som do obturador
- Permissão para salvar localização nas fotos
- Opção de salvar cópia original junto de fotos com filtro LUT
- Filtros LUT personalizados importados por você
- Configuração dos controles da barra superior

### 2.3 Dados de LUTs personalizados

Quando você importa um arquivo `.cube` de filtro LUT personalizado, o conteúdo desse arquivo é armazenado localmente no dispositivo para uso futuro. Esses arquivos não são transmitidos a terceiros.

---

## 3. Dados de Localização

O Komorebi solicita permissão de acesso à localização do dispositivo **exclusivamente** para as seguintes finalidades:

- Incorporar coordenadas GPS nos metadados EXIF das fotos capturadas (quando ativado nas configurações);
- Exibir informações climáticas e de localização no painel meteorológico integrado ao aplicativo (consultando APIs públicas de terceiros descritas na Seção 5).

**Você pode desativar o salvamento de localização nas fotos a qualquer momento** nas configurações do aplicativo. Ao desativar, os campos GPS são removidos dos metadados de imagens futuras.

O acesso à localização é do tipo **"apenas durante o uso"** (`foreground permission`). O aplicativo não acessa sua localização em segundo plano.

---

## 4. Câmera e Galeria

O Komorebi requer acesso à:

- **Câmera:** Para captura de fotos. Nenhuma imagem é transmitida a servidores sem sua ação explícita.
- **Biblioteca de mídia:** Para salvar fotos no álbum "Komorebi" e para leitura das imagens na galeria integrada do app.

Todas as fotos permanecem **no seu dispositivo**. O aplicativo não realiza upload automático de imagens a nenhum serviço externo.

---

## 5. Serviços de Terceiros

O Komorebi integra-se a serviços externos **apenas para funcionalidades específicas e não relacionadas à coleta de dados pessoais identificáveis**:

| Serviço | Finalidade | Dados enviados |
|---|---|---|
| **Open-Meteo API** (`api.open-meteo.com`) | Previsão do tempo no painel meteorológico | Coordenadas geográficas aproximadas (latitude/longitude) |
| **BigDataCloud API** (`api.bigdatacloud.net`) | Geocodificação reversa (nome da cidade/região) | Coordenadas geográficas |
| **Leaflet.js / CartoDB** | Exibição de mapa na galeria para fotos com GPS | Apenas carregamento de tiles de mapa; coordenadas processadas localmente |
| **Site do Gerador de EXIF Frame** (`criador-de-exif-frame.onrender.com`) | Criação de molduras de exibição de metadados | Imagem selecionada pelo usuário (processada no navegador) |
| **Notion** (`fabiosantoss.notion.site`) | Formulário de feedback | Apenas o que você digitar voluntariamente |

Esses serviços possuem suas próprias políticas de privacidade, pelas quais a Equipe Komorebi não se responsabiliza.

---

## 6. Publicidade

**O Komorebi não exibe anúncios e não integra redes de publicidade.** Nenhum dado seu é utilizado para fins publicitários.

---

## 7. Compartilhamento de Dados

A Equipe Komorebi **não vende, aluga ou compartilha** suas informações pessoais com terceiros, exceto:

- Quando exigido por lei ou ordem judicial;
- Para proteger direitos legais da Equipe Komorebi.

---

## 8. Segurança

Todos os dados gerados pelo Komorebi são armazenados localmente no seu dispositivo, sujeitos às proteções de segurança do próprio sistema operacional (iOS ou Android). A Equipe Komorebi não mantém servidores próprios com dados de usuários.

---

## 9. Crianças

O Komorebi não é direcionado a crianças menores de 13 anos e não coleta intencionalmente informações de menores. Se você é pai ou responsável e acredita que seu filho forneceu dados ao aplicativo, entre em contato com a Equipe Komorebi para que as medidas adequadas sejam tomadas.

---

## 10. Seus Direitos

Você tem o direito de:

- **Acessar** as configurações e dados armazenados localmente pelo app;
- **Excluir** qualquer foto salva diretamente pela galeria do dispositivo ou pela galeria integrada do app;
- **Revogar** permissões de câmera, galeria e localização a qualquer momento nas configurações do sistema operacional;
- **Remover** filtros LUT personalizados importados diretamente nas configurações do app.

Como o app não coleta dados em servidores próprios, não há necessidade de solicitação formal de exclusão de dados remotos.

---

## 11. Alterações nesta Política

Esta Política de Privacidade pode ser atualizada periodicamente. Quando isso ocorrer, a data no topo do documento será atualizada. Recomenda-se que você a revise regularmente.

---

## 12. Contato

Se tiver dúvidas sobre esta Política de Privacidade, entre em contato com a Equipe Komorebi:

- **Desenvolvedor:** Fábio Santos
- **Site:** [fotoessencia.fabiosantos.dev.br](https://fotoessencia.fabiosantos.dev.br/)
- **Instagram:** [@fotoessencia_](https://www.instagram.com/fotoessencia_/)
- **GitHub:** [github.com/Gwin14](https://github.com/Gwin14)

---

*Este documento foi elaborado com base nas funcionalidades implementadas no Komorebi v1.0.0 e é regido pelas leis brasileiras, em especial a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).*
