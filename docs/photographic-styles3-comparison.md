# Comparação dos HEICs de Estilos Fotográficos

Amostras fornecidas em 05/10/2026. A identificação abaixo usa o conteúdo dos
arquivos, não sua ordem no ZIP.

| Arquivo                                                     | Resultado informado no Fotos | Styles               | Textura                       | Máscaras 2026 + XMP |
| ----------------------------------------------------------- | ---------------------------- | -------------------- | ----------------------------- | ------------------- |
| `komorebi-styles-969EC8B7-3ABA-4690-AD50-DF3EDC453584.HEIC` | Estilos 2 disponíveis        | Versão 15, sem `l`   | Ausente                       | Ausentes            |
| `komorebi-styles-2AC5AB28-9375-42A3-BBE4-CC66968ADA8B.HEIC` | Nenhum estilo disponível     | Versão 15, sem `l`   | Presente, perfil `iPhone18,1` | Ausentes            |
| `NO_FUSION_1005_001.HEIC`                                   | Estilos 3 disponíveis        | Versão 16, `l=false` | Presente, perfil `iPhone19,2` | 12 pares presentes  |

Os dois Komorebi mantêm o mesmo grafo básico: mapa de diferenças de estilo,
thumbnail linear, sky matte, HDR/tmap, EXIF e plist Styles. O arquivo com modo 3
acrescentava apenas `texture_styles`; presença desse URI e plist válido não
comprovam reconhecimento pelo Fotos.

## Correção

Somente com o toggle 3 ativo, promover o seletor `0` do plist Styles para 16,
acrescentar `l=false`, usar o perfil de textura da referência funcional e adicionar
as 12 máscaras monocromáticas com seus metadados FSINC. Manter os demais valores
Styles, os pixels, HDR, EXIF, MakerNote e catálogo. Com o toggle desligado, manter
o caminho da versão 15.

As máscaras adicionadas são neutras e não têm pixels de pessoas ou da referência.
Os cinco templates (duas orientações de 4:3 e 16:9, mais 1:1) foram codificados a
partir de gray8 zero e decodificados novamente, verificando cada pixel. Isso
preserva o formato monocromático nativo também no iOS, onde o backend VideoToolbox
do app produz HEVC 4:2:0. Não há segmentação de rostos nesta implementação.

## Validação reproduzível

`rust/examples/check_styles3_samples.rs` recebe os caminhos dos HEICs: Komorebi 2,
No Fusion, saída, e opcionalmente Komorebi 3 com falha. Ele confirma os contratos
original/referência, gera a saída pelo mesmo FFI usado no app e compara todos os
payloads anteriores, referências e propriedades. Apenas o plist Styles muda;
seus valores anteriores são preservados, alterando `0` e acrescentando `l`.

```sh
cargo run --offline --manifest-path modules/camera-photographic-styles/rust/Cargo.toml \
  --example check_styles3_samples -- ESTILOS2.HEIC NO_FUSION.HEIC CORRIGIDO.HEIC FALHA3.HEIC
```

Os testes de regressão cobrem atualização de esquema, arquivos incompletos,
referências, XMPs individuais e deslocamento de payloads nos layouts de metadados.
A estrutura corrigida foi comparada com o arquivo que o usuário confirmou ser
reconhecido. A confirmação visual dos controles ainda exige importar a saída no
Fotos do iPhone; a validação estrutural não substitui essa verificação.
