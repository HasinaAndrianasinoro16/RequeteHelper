-- Script Oracle : Création de 2 schémas avec tables et données d'exemple
-- Nettoyage préalable (optionnel - à exécuter avec prudence)
-- DROP USER comptabilite CASCADE;
-- DROP USER ventes CASCADE;

-- =============================================
-- SCHÉMA COMPTABILITE
-- =============================================

-- Création du schéma COMPTABILITE
CREATE USER comptabilite IDENTIFIED BY comptabilite123
DEFAULT TABLESPACE USERS
TEMPORARY TABLESPACE TEMP
QUOTA UNLIMITED ON USERS;

-- Attribution des privilèges
GRANT CONNECT, RESOURCE TO comptabilite;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW TO comptabilite;

-- Connexion au schéma COMPTABILITE
CONNECT comptabilite/comptabilite123;

-- Table ECRITURES_COMPTABLES
CREATE TABLE ecritures_comptables (
                                      numero_ecriture NUMBER PRIMARY KEY,
                                      date_ecriture DATE NOT NULL,
                                      compte_debit VARCHAR2(10) NOT NULL,
                                      compte_credit VARCHAR2(10) NOT NULL,
                                      montant NUMBER(15,2) NOT NULL,
                                      libelle VARCHAR2(200) NOT NULL,
                                      journal VARCHAR2(5) NOT NULL,
                                      statut VARCHAR2(20) DEFAULT 'Brouillon',
                                      date_creation DATE DEFAULT SYSDATE,
                                      utilisateur_creation VARCHAR2(50) DEFAULT USER
);

-- Table CLIENTS
CREATE TABLE clients (
                         code_client VARCHAR2(10) PRIMARY KEY,
                         nom_client VARCHAR2(100) NOT NULL,
                         ville VARCHAR2(50),
                         categorie VARCHAR2(30),
                         chiffre_affaire NUMBER(12,2),
                         email VARCHAR2(100),
                         telephone VARCHAR2(20),
                         date_inscription DATE DEFAULT SYSDATE,
                         statut VARCHAR2(20) DEFAULT 'Actif'
);

-- Séquence pour les numéros d'écriture
CREATE SEQUENCE seq_ecritures
    START WITH 1001
    INCREMENT BY 1
    NOCACHE
NOCYCLE;

-- Insertion des données dans ECRITURES_COMPTABLES
INSERT INTO ecritures_comptables (numero_ecriture, date_ecriture, compte_debit, compte_credit, montant, libelle, journal, statut)
VALUES (seq_ecritures.NEXTVAL, DATE '2024-01-15', '512000', '411000', 1500.00, 'Vente client DUPONT', 'VT', 'Validé');

INSERT INTO ecritures_comptables (numero_ecriture, date_ecriture, compte_debit, compte_credit, montant, libelle, journal, statut)
VALUES (seq_ecritures.NEXTVAL, DATE '2024-01-16', '606000', '401000', 800.50, 'Achat fournisseur MARTIN', 'ACH', 'Validé');

INSERT INTO ecritures_comptables (numero_ecriture, date_ecriture, compte_debit, compte_credit, montant, libelle, journal, statut)
VALUES (seq_ecritures.NEXTVAL, DATE '2024-01-17', '512000', '706000', 2300.00, 'Vente service', 'VT', 'Brouillon');

INSERT INTO ecritures_comptables (numero_ecriture, date_ecriture, compte_debit, compte_credit, montant, libelle, journal, statut)
VALUES (seq_ecritures.NEXTVAL, DATE '2024-01-18', '641000', '512000', 450.00, 'Frais de déplacement', 'OD', 'Validé');

INSERT INTO ecritures_comptables (numero_ecriture, date_ecriture, compte_debit, compte_credit, montant, libelle, journal, statut)
VALUES (seq_ecritures.NEXTVAL, DATE '2024-01-19', '411000', '512000', 1200.00, 'Règlement client', 'BQ', 'Validé');

-- Insertion des données dans CLIENTS
INSERT INTO clients (code_client, nom_client, ville, categorie, chiffre_affaire, email, telephone)
VALUES ('CLI001', 'DUPONT SARL', 'Paris', 'Grand Compte', 150000, 'contact@dupont-sarl.fr', '01 45 67 89 10');

INSERT INTO clients (code_client, nom_client, ville, categorie, chiffre_affaire, email, telephone)
VALUES ('CLI002', 'MARTIN SA', 'Lyon', 'PME', 75000, 'direction@martin-sa.com', '04 78 12 34 56');

INSERT INTO clients (code_client, nom_client, ville, categorie, chiffre_affaire, email, telephone)
VALUES ('CLI003', 'DURAND EURL', 'Marseille', 'PME', 45000, 'info@durand-eurl.fr', '04 91 23 45 67');

INSERT INTO clients (code_client, nom_client, ville, categorie, chiffre_affaire, email, telephone)
VALUES ('CLI004', 'LEROY INDUSTRIES', 'Lille', 'Grand Compte', 280000, 'commercial@leroy-industries.com', '03 20 45 67 89');

INSERT INTO clients (code_client, nom_client, ville, categorie, chiffre_affaire, email, telephone)
VALUES ('CLI005', 'PETIT & FILS', 'Bordeaux', 'TPE', 25000, 'petit-fils@contact.fr', '05 56 78 90 12');

-- Création d'index pour améliorer les performances
CREATE INDEX idx_ecritures_date ON ecritures_comptables(date_ecriture);
CREATE INDEX idx_ecritures_journal ON ecritures_comptables(journal);
CREATE INDEX idx_ecritures_statut ON ecritures_comptables(statut);
CREATE INDEX idx_clients_ville ON clients(ville);
CREATE INDEX idx_clients_categorie ON clients(categorie);

-- Validation des transactions
COMMIT;

-- =============================================
-- SCHÉMA VENTES
-- =============================================

-- Création du schéma VENTES
CREATE USER ventes IDENTIFIED BY ventes123
DEFAULT TABLESPACE USERS
TEMPORARY TABLESPACE TEMP
QUOTA UNLIMITED ON USERS;

-- Attribution des privilèges
GRANT CONNECT, RESOURCE TO ventes;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW TO ventes;

-- Connexion au schéma VENTES
CONNECT ventes/ventes123;

-- Table COMMANDES
CREATE TABLE commandes (
                           numero_commande NUMBER PRIMARY KEY,
                           date_commande DATE NOT NULL,
                           client VARCHAR2(100) NOT NULL,
                           montant_ttc NUMBER(10,2) NOT NULL,
                           statut VARCHAR2(20) DEFAULT 'En attente',
                           mode_livraison VARCHAR2(30),
                           date_livraison_prevue DATE,
                           date_livraison_reelle DATE,
                           commercial VARCHAR2(50),
                           notes VARCHAR2(500),
                           date_creation DATE DEFAULT SYSDATE
);

-- Table PRODUITS
CREATE TABLE produits (
                          code_produit VARCHAR2(10) PRIMARY KEY,
                          libelle_produit VARCHAR2(100) NOT NULL,
                          categorie VARCHAR2(30) NOT NULL,
                          prix_unitaire_ht NUMBER(8,2) NOT NULL,
                          taux_tva NUMBER(4,2) DEFAULT 20.00,
                          stock_disponible NUMBER(8) DEFAULT 0,
                          stock_alerte NUMBER(8) DEFAULT 10,
                          date_mise_en_stock DATE DEFAULT SYSDATE,
                          actif VARCHAR2(1) DEFAULT 'O'
);

-- Séquence pour les numéros de commande
CREATE SEQUENCE seq_commandes
    START WITH 5001
    INCREMENT BY 1
    NOCACHE
NOCYCLE;

-- Insertion des données dans COMMANDES
INSERT INTO commandes (numero_commande, date_commande, client, montant_ttc, statut, mode_livraison, date_livraison_prevue, commercial)
VALUES (seq_commandes.NEXTVAL, DATE '2024-01-10', 'DUPONT SARL', 2500.00, 'Livré', 'Express', DATE '2024-01-12', 'DURAND');

INSERT INTO commandes (numero_commande, date_commande, client, montant_ttc, statut, mode_livraison, date_livraison_prevue, commercial)
VALUES (seq_commandes.NEXTVAL, DATE '2024-01-11', 'DURAND EURL', 1500.00, 'En cours', 'Standard', DATE '2024-01-16', 'MARTIN');

INSERT INTO commandes (numero_commande, date_commande, client, montant_ttc, statut, mode_livraison, date_livraison_prevue, commercial)
VALUES (seq_commandes.NEXTVAL, DATE '2024-01-12', 'MARTIN SA', 3200.50, 'Validé', 'Express', DATE '2024-01-15', 'DURAND');

INSERT INTO commandes (numero_commande, date_commande, client, montant_ttc, statut, mode_livraison, date_livraison_prevue, commercial)
VALUES (seq_commandes.NEXTVAL, DATE '2024-01-13', 'LEROY INDUSTRIES', 5800.00, 'En préparation', 'Standard', DATE '2024-01-20', 'PETIT');

INSERT INTO commandes (numero_commande, date_commande, client, montant_ttc, statut, mode_livraison, date_livraison_prevue, commercial)
VALUES (seq_commandes.NEXTVAL, DATE '2024-01-14', 'PETIT & FILS', 850.75, 'Livré', 'Express', DATE '2024-01-16', 'MARTIN');

-- Insertion des données dans PRODUITS
INSERT INTO produits (code_produit, libelle_produit, categorie, prix_unitaire_ht, taux_tva, stock_disponible, stock_alerte)
VALUES ('PROD001', 'Ordinateur Portable Elite', 'Informatique', 899.99, 20.00, 25, 5);

INSERT INTO produits (code_produit, libelle_produit, categorie, prix_unitaire_ht, taux_tva, stock_disponible, stock_alerte)
VALUES ('PROD002', 'Smartphone Galaxy Pro', 'Téléphonie', 649.99, 20.00, 50, 10);

INSERT INTO produits (code_produit, libelle_produit, categorie, prix_unitaire_ht, taux_tva, stock_disponible, stock_alerte)
VALUES ('PROD003', 'Imprimante Laser Color', 'Bureautique', 299.99, 20.00, 15, 3);

INSERT INTO produits (code_produit, libelle_produit, categorie, prix_unitaire_ht, taux_tva, stock_disponible, stock_alerte)
VALUES ('PROD004', 'Casque Audio Bluetooth', 'Audio', 149.99, 20.00, 30, 8);

INSERT INTO produits (code_produit, libelle_produit, categorie, prix_unitaire_ht, taux_tva, stock_disponible, stock_alerte)
VALUES ('PROD005', 'Écran 24 pouces 4K', 'Informatique', 199.99, 20.00, 20, 4);

-- Création d'index pour améliorer les performances
CREATE INDEX idx_commandes_date ON commandes(date_commande);
CREATE INDEX idx_commandes_client ON commandes(client);
CREATE INDEX idx_commandes_statut ON commandes(statut);
CREATE INDEX idx_produits_categorie ON produits(categorie);
CREATE INDEX idx_produits_actif ON produits(actif);

-- Validation des transactions
COMMIT;

-- =============================================
-- VUES ET PRIVILÈGES CROISÉS
-- =============================================

-- Donner l'accès en lecture au schéma COMPTABILITE pour VENTES
CONNECT comptabilite/comptabilite123;
GRANT SELECT ON ecritures_comptables TO ventes;
GRANT SELECT ON clients TO ventes;

-- Donner l'accès en lecture au schéma VENTES pour COMPTABILITE
CONNECT ventes/ventes123;
GRANT SELECT ON commandes TO comptabilite;
GRANT SELECT ON produits TO comptabilite;

-- Création de vues pour faciliter les requêtes croisées
CONNECT comptabilite/comptabilite123;

CREATE OR REPLACE VIEW vue_commandes_ventes AS
SELECT c.numero_commande, c.date_commande, c.client, c.montant_ttc, c.statut
FROM ventes.commandes c;

CONNECT ventes/ventes123;

CREATE OR REPLACE VIEW vue_clients_comptabilite AS
SELECT c.code_client, c.nom_client, c.ville, c.categorie, c.chiffre_affaire
FROM comptabilite.clients c;

-- =============================================
-- SYNONYMES POUR FACILITER L'UTILISATION
-- =============================================

CONNECT comptabilite/comptabilite123;

CREATE SYNONYM commandes_ventes FOR ventes.commandes;
CREATE SYNONYM produits_ventes FOR ventes.produits;

CONNECT ventes/ventes123;

CREATE SYNONYM ecritures_compta FOR comptabilite.ecritures_comptables;
CREATE SYNONYM clients_compta FOR comptabilite.clients;

-- =============================================
-- VALIDATION FINALE
-- =============================================
COMMIT;

-- Message de confirmation
PROMPT =============================================
PROMPT Script exécuté avec succès !
PROMPT =============================================
PROMPT Schémas créés :
PROMPT - COMPTABILITE (mot de passe : comptabilite123)
PROMPT - VENTES (mot de passe : ventes123)
PROMPT
PROMPT Connexion possible avec :
PROMPT SQL> CONNECT comptabilite/comptabilite123
PROMPT SQL> CONNECT ventes/ventes123
PROMPT =============================================