# Estudo: quilometragem por GPS do celular

Escopo atualizado em 26/11/2026: aplicativo mobile instalado em **iPhone e
Android**, com localização em segundo plano, inclusive com tela bloqueada.
Este documento é um estudo; GPS e aplicativos nativos ainda não foram implementados.

## Experiência desejada

1. Escolher o veículo e informar a quilometragem real do painel no primeiro uso.
2. Ativar quilometragem automática e conceder as permissões necessárias.
3. Medir viagens daquele veículo em segundo plano e acumular distância válida.
4. Atualizar automaticamente a quilometragem estimada e a previsão de manutenção,
   sem exigir nova digitação a cada viagem.
5. Permitir pausar a automação e corrigir o valor com uma leitura real do painel.

A leitura real de referência e as distâncias GPS posteriores formam a estimativa.
Uma nova leitura real estabelece outra referência, preservando o histórico e sem
somar novamente viagens já contabilizadas.

## Identificar o veículo

GPS acompanha o celular, não o carro. Velocidade ou detecção de condução não
distinguem carro próprio, ônibus, Uber e carona. Apenas o input inicial e a
permissão não garantem quilometragem correta do veículo.

Primeira etapa proposta: **Iniciar/Finalizar trajeto**, com medição em segundo
plano e atualização automática da distância, mantendo opção de correção.
Para automação completa, estudar associação ao Bluetooth do veículo quando
disponível, combinada com movimento e regras de início/fim. Essa alternativa
precisa de prova de conceito nos dois sistemas; não é garantia universal.
Viagens ambíguas devem aguardar associação antes de alterar a quilometragem.

## Arquitetura mobile a avaliar

Reaproveitar React e a API atual com **Capacitor** e integração nativa de
localização em segundo plano. O plugin oficial de geolocalização não oferece
esse rastreamento diretamente. Comparar módulo próprio e alternativas
comunitárias por manutenção, licença e compatibilidade, sem adotar dependências
antes da prova de conceito.

| Plataforma | Mecanismo                                                                    | Condições                                                                                                       |
| ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| iPhone     | Core Location e modo de localização em segundo plano                         | Autorizações e sessão adequadas; avaliar acesso Sempre para início automático. Tratar suspensão e encerramento. |
| Android    | Serviço em primeiro plano do tipo location, com notificação durante a viagem | Iniciar conforme restrições do sistema; avaliar acesso em segundo plano para detecção automática.               |

Não prometer continuidade após encerramento forçado, reinício, restrição de
bateria ou revogação da permissão. Indicar lacunas sem inventar distância.
O OAuth mobile requer validação própria com navegador do sistema, retorno ao
aplicativo e sessão segura; não presumir que basta abrir o login numa WebView.

## Limitações

A API de geolocalização web depende de documento ativo/visível. Trocar de aba,
bloquear a tela ou o sistema suspender a aplicação pode interromper as
atualizações; instalar como PWA não garante rastreamento contínuo em segundo
plano. Consulte [W3C Geolocation](https://www.w3.org/TR/geolocation/) e
[permissões de localização do Chrome](https://developer.chrome.com/blog/one-time-permissions).
Para rastreamento contínuo com tela bloqueada, estudar aplicativo nativo e os
mecanismos específicos da plataforma, como [localização em segundo plano na Apple](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background).

## Dados e integração para aprovação separada

- Calcular a distância no celular, filtrando pontos imprecisos, saltos e deriva
  enquanto o carro está parado. Não estimar trechos sem dados como se fossem medidos.
- Atualizar automaticamente a distância de viagens associadas ao veículo,
  identificando o valor como estimativa GPS e exibindo interrupções. Não gravar
  uma estimativa como se fosse leitura real do painel.
- Enviar somente resumo da viagem, sem trajeto ou coordenadas, usando API e
  DynamoDB existentes. Evitar mapas e APIs de rota que criem dependência/custo novo.
- Definir origem GPS própria no contrato, distinta de MANUAL/OBD2. Persistir
  viagens localmente para operar sem rede e sincronizar resumos com identificador
  único, horários, veículo, distância e qualidade. Garantir idempotência e
  concorrência com ajustes manuais ou outro aparelho, sem duplicar quilômetros.
- Disponibilizar controles de ativação, pausa e remoção dos dados locais de
  localização; definir retenção mínima dos pontos usados no cálculo.
- Testar em aparelhos reais Android e iPhone: aplicativo visível, segundo plano,
  tela bloqueada, sinal ruim/túnel, perda de rede, permissões negadas/aproximadas/
  revogadas, carro parado, economia de bateria, encerramento forçado e reinício.
- Testar ônibus/carona, troca de veículo, dois aparelhos, sincronização repetida,
  ajustes simultâneos, OAuth e isolamento entre contas. Medir erro em relação ao
  painel e consumo de bateria; definir critérios de aceitação antes de liberar.

O consumo adicional de Lambda/DynamoDB deve ser medido; reutilizar serviços
não torna chamadas e armazenamento ilimitadamente gratuitos.

Avaliar separadamente custos de distribuição nas lojas, builds e plugins.
Não contratar serviços ou plugins pagos sem apresentar recurso e valor para
aprovação. O build e a assinatura iOS exigem ferramentas Apple.

Próximo passo proposto: prova de conceito de localização em segundo plano nos
dois sistemas antes de integrar a atualização de quilometragem à produção.

## Referências da proposta mobile

- [Apple: localização em segundo plano](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)
- [Apple: eficiência de localização](https://developer.apple.com/documentation/xcode/accessing-the-device-s-location-efficiently)
- [Android: serviços em primeiro plano](https://developer.android.com/about/versions/14/changes/fgs-types-required)
- [Android: restrições de início de serviços](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Android: permissões de localização](https://developer.android.com/develop/sensors-and-location/location/permissions)
- [Google Play: requisitos de localização em segundo plano](https://support.google.com/googleplay/android-developer/answer/9799150)
- [Capacitor: geolocalização](https://capacitorjs.com/docs/apis/geolocation)
- [Plugin comunitário a avaliar, sem adoção definida](https://github.com/capacitor-community/background-geolocation)
