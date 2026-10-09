# UIScene depois de `prebuild --clean`

O procedimento manual deste documento foi substituído pelo plugin
`plugins/withUiSceneManifest.js`, já registrado em `app.json`. Ele gera o
SceneDelegate, ajusta o AppDelegate e registra o arquivo no projeto Xcode.
Não é necessário copiar as antigas implementações Swift após o prebuild.

Consulte [UIScene via config plugin](uiscene-plugin-plan.md) para regeneração,
verificação e diagnóstico. Faça correções permanentes no plugin para que
sobrevivam à próxima geração do projeto nativo.
