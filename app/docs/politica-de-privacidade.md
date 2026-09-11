# Política de Privacidade - Komorebi

**Última atualização:** julho de 2026
**Versão do app:** 1.0.0

---

## 1. Visão geral

O **Komorebi** é um aplicativo de câmera desenvolvido por **Fábio Santos** com foco em captura fotográfica, processamento local de imagens, filtros LUT e preservação de metadados. Esta Política de Privacidade explica quais dados o app usa, onde eles ficam armazenados e quando serviços externos podem ser acessados.

O Komorebi não possui contas de usuário, não mantém servidores próprios com dados pessoais, não vende dados, não exibe anúncios e não usa redes de publicidade.

---

## 2. Dados processados no dispositivo

A maior parte do funcionamento do Komorebi acontece localmente no seu aparelho.

O app pode criar, ler ou armazenar localmente:

- **Fotos e arquivos de captura:** imagens feitas pelo app, incluindo fotos padrão, fotos em modo retrato, Live Photos e arquivos RAW/ProRAW quando o dispositivo oferecer suporte.
- **Álbum "Komorebi":** álbum criado na biblioteca de mídia para organizar as imagens capturadas.
- **Metadados EXIF:** dados técnicos gravados ou preservados nas fotos, como data, orientação, lente, ISO, velocidade do obturador, balanço de branco, modo de captura, filtro usado e informações próprias do Komorebi.
- **Localização GPS nas fotos:** latitude, longitude e altitude podem ser gravadas nos metadados EXIF quando a permissão de localização estiver concedida e a opção "Salvar Localização nas Fotos" estiver ativada.
- **Preferências do app:** configurações como estilo retrô do viewfinder, grade, som do obturador, salvamento de localização, cópia original sem LUT, posição/ordem dos controles da TopBar e lista de LUTs personalizados.
- **LUTs personalizados:** arquivos `.cube` importados por você são lidos e salvos localmente para uso nos filtros.

Esses dados permanecem no dispositivo, exceto nos casos descritos na seção "Serviços de terceiros".

---

## 3. Permissões

O Komorebi solicita permissões do sistema operacional apenas para habilitar funcionalidades do app:

| Permissão                   | Finalidade                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Câmera                      | Capturar fotos e exibir o preview da câmera.                                                                                |
| Biblioteca de mídia / Fotos | Salvar fotos no álbum "Komorebi", exibir a galeria integrada, ler metadados e excluir fotos quando você solicitar.          |
| Localização durante o uso   | Gravar GPS nas fotos, quando ativado, e buscar clima/localidade para o painel de tempo.                                     |
| Microfone                   | Declarada na configuração nativa para compatibilidade com recursos de câmera/vídeo, mas o app atual é focado em fotografia. |

Você pode revogar permissões nas configurações do iOS ou Android. A revogação pode impedir recursos correspondentes, como captura, salvamento na galeria, mapa ou clima.

---

## 4. Localização

O app pode usar sua localização em dois contextos:

- **EXIF das fotos:** quando "Salvar Localização nas Fotos" estiver ativado, a localização pode ser incorporada aos metadados das fotos futuras.
- **Painel de tempo:** a TopBar pode solicitar localização para consultar temperatura, nuvens, vento, precipitação, nascer/pôr do sol e nome aproximado da cidade/região.

O Komorebi usa permissão de localização **durante o uso**. O app não acessa localização em segundo plano.

Se você desativar "Salvar Localização nas Fotos", o Komorebi deixa de gravar coordenadas GPS em novas fotos. Fotos já salvas podem continuar contendo localização nos seus metadados até que você edite ou remova esses dados fora do app.

---

## 5. Fotos, galeria e metadados

As fotos são salvas na biblioteca de mídia do dispositivo, geralmente no álbum "Komorebi". A galeria integrada mostra fotos desse álbum, exibe metadados EXIF, pode abrir um mapa quando houver coordenadas GPS e permite excluir a foto selecionada.

O Komorebi não faz upload automático das suas fotos. Compartilhamentos ou envios para outros serviços acontecem apenas quando você usa recursos externos ou ações do próprio sistema.

---

## 6. Serviços de terceiros

Algumas funções dependem de serviços externos. Nesses casos, dados necessários para a função podem ser enviados ao provedor correspondente:

| Serviço                                                          | Finalidade                                         | Dados enviados ou acessados                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Open-Meteo** (`api.open-meteo.com`)                            | Dados meteorológicos no painel de tempo.           | Latitude e longitude aproximadas.                                                                                  |
| **BigDataCloud** (`api.bigdatacloud.net`)                        | Geocodificação reversa para cidade/região/país.    | Latitude e longitude aproximadas.                                                                                  |
| **Leaflet / Carto basemaps / unpkg**                             | Exibir mapa na galeria para fotos com GPS.         | Carregamento de scripts, estilos e tiles de mapa; o mapa é centrado nas coordenadas da foto.                       |
| **Gerador de EXIF Frame** (`criador-de-exif-frame.onrender.com`) | Criar molduras com foto e metadados.               | Quando você abre uma foto nesse recurso, a imagem pode ser enviada/injetada no site em WebView para processamento. |
| **Notion** (`fabiosantoss.notion.site`)                          | Formulário de feedback.                            | Informações que você digitar voluntariamente no formulário.                                                        |
| **Links externos**                                               | Abrir site, GitHub, Instagram, Threads ou YouTube. | O acesso passa a ocorrer fora do app ou em WebView, conforme o serviço.                                            |

Esses serviços têm políticas próprias. O Komorebi não controla as práticas de privacidade, disponibilidade ou segurança desses terceiros.

---

## 7. Publicidade, analytics e venda de dados

O Komorebi não exibe anúncios, não integra redes de publicidade e não vende, aluga ou comercializa dados pessoais.

O projeto atual também não inclui serviço próprio de analytics de uso ou rastreamento comportamental.

---

## 8. Segurança e retenção

Os dados locais ficam sujeitos às proteções do seu dispositivo e do sistema operacional. O Komorebi não mantém cópias em servidor próprio.

Você controla a retenção dos seus dados ao:

- excluir fotos pela galeria do sistema ou pela galeria integrada;
- remover LUTs personalizados nas configurações;
- revogar permissões do app;
- desinstalar o aplicativo, o que pode remover preferências locais do app, mas não necessariamente fotos já salvas na biblioteca de mídia.

---

## 9. Direitos do usuário

Como o Komorebi não mantém uma base remota própria de dados pessoais, seus principais controles estão no dispositivo:

- acessar e alterar preferências nas configurações do app;
- excluir fotos e metadados associados;
- remover arquivos LUT personalizados;
- revogar permissões de câmera, fotos e localização;
- não usar serviços externos como feedback, mapa ou EXIF Frame.

Solicitações ou dúvidas sobre privacidade podem ser enviadas pelos canais de contato abaixo.

---

## 10. Crianças e adolescentes

O Komorebi não é direcionado especificamente a crianças. O app não coleta intencionalmente dados de menores em servidores próprios. Responsáveis devem orientar o uso de câmera, localização, galeria e compartilhamento de imagens conforme a legislação aplicável.

---

## 11. Alterações nesta política

Esta Política de Privacidade pode ser atualizada quando o app mudar suas funcionalidades, permissões ou integrações. A data no topo indicará a versão mais recente.

---

## 12. Contato

- **Desenvolvedor:** Fábio Santos
- **Site:** [fotoessencia.fabiosantos.dev.br](https://fotoessencia.fabiosantos.dev.br/)
- **Instagram:** [@fotoessencia_](https://www.instagram.com/fotoessencia_/)
- **GitHub:** [github.com/Gwin14](https://github.com/Gwin14)

---

_Esta política foi escrita com base nas funcionalidades atuais do Komorebi e considera a legislação brasileira aplicável, incluindo a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018)._
