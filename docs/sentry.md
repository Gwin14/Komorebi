# Sentry

O Komorebi envia erros e amostras de desempenho para o projeto `fabio-company/komorebi`. A inicialização fica em `app/utils/diagnostics.js`, após a leitura das preferências em `SettingsContext`; o DSN público está no código e pode ser substituído por `EXPO_PUBLIC_SENTRY_DSN` durante o build. Em desenvolvimento, todas as transações são amostradas; em builds de distribuição, 20%.

O compartilhamento de diagnósticos vem ativado por padrão e pode ser desligado na página beta do onboarding ou em Configurações > Sobre. A preferência `@settings/diagnosticsEnabled` é persistida; com ela desligada, o SDK não é inicializado na abertura seguinte. Ao desligar durante a sessão, eventos JavaScript são bloqueados imediatamente e o SDK JavaScript/nativo é encerrado. Dados já enviados não são apagados.

A página beta é controlada por `EXPO_PUBLIC_BETA`: desenvolvimento/preview usam `true`, produção usa `false` em `eas.json`. Para builds locais, o padrão é beta.

O plugin `@sentry/react-native` em `app.json` configura os projetos nativos. `metro.config.js` inclui os identificadores de depuração necessários para associar bundles e mapas de código aos eventos. Como `ios/` e `android/` são gerados e ignorados pelo Git, execute `npx expo prebuild --platform ios --no-install` ou `npx expo prebuild --platform android --no-install` depois de adicionar o SDK a uma cópia local já existente.

`SENTRY_AUTH_TOKEN` está configurado como segredo do projeto EAS nos ambientes `preview` e `production`. O token de organização usa o escopo `org:ci` para upload de artefatos e criação de releases no Sentry. Não coloque seu valor no repositório, em `app.json` nem em variáveis `EXPO_PUBLIC_*`. Builds locais e de desenvolvimento sem esse segredo ainda podem enviar eventos, mas os rastros de builds de distribuição podem ficar sem linhas de origem legíveis.

Após gerar um build novo e instalar em um dispositivo, provoque um erro controlado no app e confirme no painel do projeto que a mensagem, a pilha e a versão aparecem. Verifique também uma transação de desempenho. O build novo é necessário para incluir o módulo nativo; atualizar apenas o JavaScript de uma instalação antiga não basta.
