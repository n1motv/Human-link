# ADR 0009 : File d'attente des e-mails dans MongoDB plutôt que BullMQ ou Agenda

**Statut :** acceptée

## Contexte

Un e-mail d'activation perdu pendant une panne SMTP ne repartait pas. Il faut des reprises espacées et une page où l'administrateur voit les envois en échec.

## Décision

Une collection `MailJob` : le message est enregistré, « pris » de façon atomique (`findOneAndUpdate`) avec un bail de 5 minutes, envoyé, puis repris à 1 min, 5 min, 30 min, 2 h, 6 h en cas d'échec avant de passer en « échec » pour décision de l'administrateur. Un passage régulier toutes les 30 secondes reprend ce qui est dû, y compris après un redémarrage.

## Pourquoi

- Aucune infrastructure de plus à livrer et à surveiller par client : BullMQ exige Redis ; Agenda est une file MongoDB de plus, à apprivoiser pour un besoin d'une dizaine de lignes de logique.
- Le volume est faible (quelques e-mails par jour et par client).
- Le corps du message est chiffré en base et effacé à l'envoi : une file ne devient pas un second stock de liens d'activation.

## Conséquences

- Pas de priorités ni de débit élevé : suffisant ici. Si le volume le demandait, la même interface (`enqueueMail`, `processMailQueue`) se brancherait sur une vraie file.
- Un seul processus d'application par client est supposé ; le bail évite quand même l'envoi en double si deux passages se croisent (testé).

## Alternatives écartées

BullMQ (Redis en plus) ; Agenda (dépendance en plus pour peu) ; envoi direct avec nouvel essai en mémoire (perdu au redémarrage).
