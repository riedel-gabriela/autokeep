# Estudo: quilometragem por GPS do celular

GPS ainda não foi implementado. A proposta inicial é um registro assistido de
viagens com a aplicação aberta: **Iniciar**, **Pausar** e **Finalizar viagem**.
O usuário concede localização ao iniciar e confirma ou corrige a distância ao
final. A leitura real do painel continua disponível e separada da estimativa.

## Limitações

A API de geolocalização web depende de documento ativo/visível. Trocar de aba,
bloquear a tela ou o sistema suspender a aplicação pode interromper as
atualizações; instalar como PWA não garante rastreamento contínuo em segundo
plano. Consulte [W3C Geolocation](https://www.w3.org/TR/geolocation/) e
[permissões de localização do Chrome](https://developer.chrome.com/blog/one-time-permissions).
Para rastreamento contínuo com tela bloqueada, estudar aplicativo nativo e os
mecanismos específicos da plataforma, como [localização em segundo plano na Apple](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background).

## Proposta de MVP para aprovação separada

- Calcular a distância no celular, filtrando pontos imprecisos, saltos e deriva
  enquanto o carro está parado. Não estimar trechos sem dados como se fossem medidos.
- Exibir distância GPS estimada e interrupções. Pedir confirmação antes de
  atualizar o odômetro; não gravar automaticamente uma estimativa como leitura real.
- Enviar somente resumo da viagem, sem trajeto ou coordenadas, usando API e
  DynamoDB existentes. Evitar mapas e APIs de rota que criem dependência/custo novo.
- Definir origem GPS própria no contrato, distinta de MANUAL/OBD2, e regras de
  confirmação antes de implementar.
- Testar em Android e iPhone: aplicativo visível, tela bloqueada, sinal ruim,
  perda de rede, permissão negada e carro parado.

O consumo adicional de Lambda/DynamoDB deve ser medido; reutilizar serviços
não torna chamadas e armazenamento ilimitadamente gratuitos.
