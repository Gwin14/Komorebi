# Sentry

O Komorebi envia erros e amostras de desempenho para o projeto `fabio-company/komorebi`. A inicialização fica em `app/utils/diagnostics.js`, após a leitura das preferências em `SettingsContext`; o DSN público está no código e pode ser substituído por `EXPO_PUBLIC_SENTRY_DSN` durante o build. Com o compartilhamento ativado, o envio de erros fica habilitado com `sampleRate: 1` em todos os ambientes. Transações de desempenho são amostradas em 100% em desenvolvimento/teste e em 20% em produção.

Os perfis EAS definem `EXPO_PUBLIC_SENTRY_ENVIRONMENT` explicitamente: `development`, `preview` (distribuição de teste) e `production`. Sem essa variável, builds locais com Metro usam `development`; builds locais de distribuição usam `preview` quando beta e `production` quando `EXPO_PUBLIC_BETA=false`. Assim, um build de teste sem `__DEV__` não aparece como produção no Sentry. Essa classificação não muda a preferência de compartilhamento.

O compartilhamento de diagnósticos vem ativado por padrão e pode ser desligado na página beta do onboarding ou em Configurações > Sobre. A preferência `@settings/diagnosticsEnabled` é persistida; com ela desligada, o SDK não é inicializado na abertura seguinte. Ao desligar durante a sessão, eventos JavaScript são bloqueados imediatamente e o SDK JavaScript/nativo é encerrado. Dados já enviados não são apagados.

A página beta é controlada por `EXPO_PUBLIC_BETA`: desenvolvimento/preview usam `true`, produção usa `false` em `eas.json`. Para builds locais, o padrão é beta.

O plugin `@sentry/react-native` em `app.json` configura os projetos nativos. `metro.config.js` inclui os identificadores de depuração necessários para associar bundles e mapas de código aos eventos. Como `ios/` e `android/` são gerados e ignorados pelo Git, execute `npx expo prebuild --platform ios --no-install` ou `npx expo prebuild --platform android --no-install` depois de adicionar o SDK a uma cópia local já existente.

`SENTRY_AUTH_TOKEN` está configurado como segredo do projeto EAS nos ambientes `preview` e `production`. O token de organização usa o escopo `org:ci` para upload de artefatos e criação de releases no Sentry. Não coloque seu valor no repositório, em `app.json` nem em variáveis `EXPO_PUBLIC_*`. Builds locais e de desenvolvimento sem esse segredo ainda podem enviar eventos, mas os rastros de builds de distribuição podem ficar sem linhas de origem legíveis.

Após gerar um build novo e instalar em um dispositivo, provoque um erro controlado no app e confirme no painel do projeto que a mensagem, a pilha e a versão aparecem. Verifique também uma transação de desempenho. O build novo é necessário para incluir o módulo nativo; atualizar apenas o JavaScript de uma instalação antiga não basta.

Valide nos três perfis: com diagnósticos ligados, o erro deve chegar no ambiente correspondente; ao desligar, nenhum novo evento deve ser enviado; ao reabrir com a preferência desligada, o SDK deve continuar sem inicializar; ao religar, o envio deve voltar. Expo Go permite validar erros JavaScript, mas falhas nativas e cache offline exigem um build com o módulo nativo. Os testes em `app/utils/diagnostics.test.cjs` cobrem a configuração e o bloqueio por preferência; não substituem a confirmação de entrega em um dispositivo.
