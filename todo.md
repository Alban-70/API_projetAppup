<details>
<summary>[ V ] <u>Créer une classe qui va être appelée à chaque post</u></summary>

- Regarder ce qu'il y a après le domaine :
- 1er : endpoint
- 2e : id
- Ensuite fields ou filters
</details>

<details>
<summary>[ V ] <u>Récupérer les noms des tables depuis l'url (faire /:table_name)</u></summary>

- <u>Exemple :</u> https://localhost:3000/.../user (nom de la table)
</details>

<details>
<summary>[ V ] <u>Récupérer les fields depuis le query (?fields=id,name,...)</u></summary>

- https://localhost:3000/.../user?fields=id,name,email
</details>

<details>
<summary>[ V ] <u>Faire pareil pour Filters</u></summary>

- https://localhost:3000/.../user?fields=id,name,email&filters=age,gt,10
</details>


<details>
<summary>[ X ] <u>Faire la route pour ajouter des données aux différentes tables </u></summary>

- https://localhost:3000/.../:table_name
- req.body = { ... }
</details>


<details>
<summary>[ X ] <u>Regarde le header à chaque fois (mettre la clé d'API dedans) </u></summary>

-  Regarder si l'access level est supérieur à n, alors refuser
- Sur le front, faire une session avec le basic header si autorisé
- Se balader de page en page avec le basic header
</details>


<details>
<summary>[ X ] <u> Générer un fichier par table pour voir toutes les colonnes requises etc </u></summary>

-  tableExists, requiredColumns, columnsExist
</details>


<details>
<summary>[ X ] <u> Faire un middleware pour les accessLevel </u></summary>

-  
</details>


<details>
<summary>[ X ] <u> Tout passer via des paramètres de fonctions et plus par attributs d'une classe</u></summary>

-  
</details>


<details>
<summary>[ X ] <u> Génère un fichier / table avec le get / post / put / deleted</u></summary>

- Au démarrage, regarder s'il y a toutes les tables, même nb de fichiers, si nouvelles tables, etc ... 
- Faire un template
- Rajouter du code spécifique pour USER par exemple
</details>


<details>
<summary>[ X ] <u> Passer les headers</u></summary>

-  
</details>