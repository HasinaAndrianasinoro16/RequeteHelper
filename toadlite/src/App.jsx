import React, { useState, useRef, useEffect } from "react";
import { Toast } from "primereact/toast";

import "primereact/resources/themes/lara-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

export default function App() {
    const toast = useRef();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [connected, setConnected] = useState(false);
    const [result, setResult] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingTables, setLoadingTables] = useState(false);

    // États pour l'interface visuelle
    const [selectedTable, setSelectedTable] = useState(null);
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [filters, setFilters] = useState([]);
    const [sorting, setSorting] = useState([]);
    const [aggregates, setAggregates] = useState([]);
    const [tables, setTables] = useState({});
    const [userInfo, setUserInfo] = useState(null);

    // États pour la pagination
    const [pagination, setPagination] = useState({
        currentPage: 1,
        pageSize: 50,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
    });

    // Options de taille de page
    const pageSizeOptions = [10, 25, 50, 100, 250, 500];

    // États pour les dialogues
    const [showFilterDialog, setShowFilterDialog] = useState(false);
    const [showSortDialog, setShowSortDialog] = useState(false);
    const [showAggregateDialog, setShowAggregateDialog] = useState(false);
    const [showTableDialog, setShowTableDialog] = useState(false);

    const [currentFilter, setCurrentFilter] = useState({ field: "", operator: "=", value: "" });
    const [currentSort, setCurrentSort] = useState({ field: "", direction: "ASC" });
    const [currentAggregate, setCurrentAggregate] = useState({
        type: "",
        columns: [],
        alias: ""
    });

    // États pour la gestion des requêtes sauvegardées
    const [savedQueries, setSavedQueries] = useState(() => {
        try {
            const saved = localStorage.getItem('savedQueries');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [showSaveQueryDialog, setShowSaveQueryDialog] = useState(false);
    const [queryName, setQueryName] = useState("");
    const [showLoadQueryDialog, setShowLoadQueryDialog] = useState(false);
    const [queryDescription, setQueryDescription] = useState("");

    // État pour le dropdown des colonnes
    const [showColumnsDropdown, setShowColumnsDropdown] = useState(true);

    // URL de base de l'API backend
    const API_BASE_URL = 'http://localhost:5000/api';

    // Fonction utilitaire pour formater les labels des colonnes
    const formatColumnLabel = (columnName) => {
        return columnName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    // Fonction pour obtenir le label d'un agrégat
    const getAggregateLabelForColumn = (columnName) => {
        const aggregate = aggregates.find(agg => {
            const generatedAlias = agg.type === 'SUM' ? `sum_${agg.columns.join('_')}` :
                agg.type === 'AVG' ? `avg_${agg.columns.join('_')}` :
                    `count_${agg.columns.join('_') || 'all'}`;

            return columnName === (agg.alias || generatedAlias);
        });

        if (aggregate) {
            const typeLabel = aggregate.type === 'SUM' ? 'Somme' :
                aggregate.type === 'AVG' ? 'Moyenne' : 'Compte';

            if (aggregate.type === 'COUNT' && aggregate.columns.length === 0) {
                return `${typeLabel} (*)`;
            }

            const columnLabels = aggregate.columns.map(col => formatColumnLabel(col));
            return `${typeLabel} de ${columnLabels.length > 3 ?
                `${columnLabels.slice(0, 3).join(', ')}...` :
                columnLabels.join(', ')}`;
        }

        return '';
    };

    // Connexion à la base de données via l'API
    const handleConnect = async () => {
        if (!username || !password) {
            toast.current.show({
                severity: 'warn',
                summary: 'Informations manquantes',
                detail: 'Veuillez entrer un nom d\'utilisateur et un mot de passe'
            });
            return;
        }

        setLoading(true);
        try {
            // Tester la connexion
            const response = await fetch(`${API_BASE_URL}/test-connection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.success) {
                // Charger les informations utilisateur
                const userResponse = await fetch(`${API_BASE_URL}/user-info`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password })
                });

                const userData = await userResponse.json();
                if (userData.success) {
                    setUserInfo(userData.userInfo);
                }

                // Charger les tables
                await loadTables();

                setConnected(true);
                toast.current.show({
                    severity: 'success',
                    summary: 'Connecté',
                    detail: `Connexion réussie : ${result.username}`
                });
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Erreur de connexion:', error);
            toast.current.show({
                severity: 'error',
                summary: 'Erreur de connexion',
                detail: error.message
            });
        } finally {
            setLoading(false);
        }
    };

    // Charger les tables
    const loadTables = async () => {
        setLoadingTables(true);
        try {
            const response = await fetch(`${API_BASE_URL}/tables`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const tablesData = await response.json();
            setTables(tablesData);
        } catch (error) {
            console.error('Erreur chargement tables:', error);
            toast.current.show({
                severity: 'error',
                summary: 'Erreur',
                detail: 'Impossible de charger les tables'
            });
        } finally {
            setLoadingTables(false);
        }
    };

    const handleDisconnect = () => {
        setConnected(false);
        setUsername("");
        setPassword("");
        setUserInfo(null);
        setTables({});
        setSelectedTable(null);
        setSelectedColumns([]);
        setFilters([]);
        setSorting([]);
        setAggregates([]);
        setResult([]);
        setPagination({
            currentPage: 1,
            pageSize: 50,
            totalCount: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
        });
        setShowColumnsDropdown(true);
    };

    // Sélection de table
    const handleTableSelect = (tableKey) => {
        setSelectedTable(tableKey);
        // Sélectionner toutes les colonnes par défaut
        const tableFields = tables[tableKey]?.fields || [];
        setSelectedColumns(tableFields.map(f => f.name));
        setShowColumnsDropdown(true);
        setShowTableDialog(false);
        // Réinitialiser la pagination
        setPagination({
            currentPage: 1,
            pageSize: 50,
            totalCount: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
        });

        toast.current.show({
            severity: 'info',
            summary: 'Table sélectionnée',
            detail: tables[tableKey]?.name || tableKey
        });
    };

    // Ajout de filtre
    const addFilter = () => {
        if (!currentFilter.field || !currentFilter.value) return;

        const newFilter = {
            id: `filter_${Date.now()}`,
            ...currentFilter,
            label: formatColumnLabel(currentFilter.field)
        };

        setFilters([...filters, newFilter]);
        setCurrentFilter({ field: "", operator: "=", value: "" });
        setShowFilterDialog(false);
    };

    // Ajout de tri
    const addSort = () => {
        if (!currentSort.field) return;

        const newSort = {
            id: `sort_${Date.now()}`,
            ...currentSort,
            label: formatColumnLabel(currentSort.field)
        };

        setSorting([...sorting, newSort]);
        setCurrentSort({ field: "", direction: "ASC" });
        setShowSortDialog(false);
    };

    // Ajouter un agrégat
    const addAggregate = () => {
        if (!currentAggregate.type || (currentAggregate.type !== 'COUNT' && currentAggregate.columns.length === 0)) return;

        const newAggregate = {
            id: `agg_${Date.now()}`,
            type: currentAggregate.type,
            columns: [...currentAggregate.columns],
            alias: currentAggregate.alias ||
                (currentAggregate.type === 'SUM' ? `sum_${currentAggregate.columns.join('_')}` :
                    currentAggregate.type === 'AVG' ? `avg_${currentAggregate.columns.join('_')}` :
                        `count_${currentAggregate.columns.length > 0 ? currentAggregate.columns.join('_') : 'all'}`),
            label: `${currentAggregate.type === 'SUM' ? 'Somme' :
                currentAggregate.type === 'AVG' ? 'Moyenne' : 'Compte'} de ${
                currentAggregate.columns.length > 0 ?
                    currentAggregate.columns.map(col => formatColumnLabel(col)).join(', ') : 'tous les champs'
            }`
        };

        setAggregates([...aggregates, newAggregate]);
        setCurrentAggregate({ type: "", columns: [], alias: "" });
        setShowAggregateDialog(false);
    };

    // Suppression de filtre/tri/agrégat
    const removeFilter = (id) => {
        setFilters(filters.filter(f => f.id !== id));
    };

    const removeSort = (id) => {
        setSorting(sorting.filter(s => s.id !== id));
    };

    const removeAggregate = (id) => {
        setAggregates(aggregates.filter(a => a.id !== id));
    };

    // Options pour les colonnes
    const getFieldOptions = () => {
        if (!selectedTable) return [];
        const table = tables[selectedTable];
        return table?.fields?.map(field => ({
            label: field.label || formatColumnLabel(field.name),
            value: field.name,
            type: field.type
        })) || [];
    };

    // Options pour les colonnes numériques
    const getNumericFieldOptions = () => {
        if (!selectedTable) return [];
        const table = tables[selectedTable];
        return table?.fields
            ?.filter(field => {
                const numericTypes = ['number', 'NUMBER', 'INTEGER', 'FLOAT', 'DECIMAL'];
                return numericTypes.includes(field.type) ||
                    (typeof field.type === 'string' &&
                        (field.type.toLowerCase().includes('number') ||
                            field.type.toLowerCase().includes('int') ||
                            field.type.toLowerCase().includes('float') ||
                            field.type.toLowerCase().includes('decimal')));
            })
            ?.map(field => ({
                label: field.label || formatColumnLabel(field.name),
                value: field.name
            })) || [];
    };

    // Exécution de la requête visuelle
    const executeVisualQuery = async (page = 1, newPageSize = null) => {
        if (!selectedTable) {
            toast.current.show({
                severity: 'warn',
                summary: 'Table manquante',
                detail: 'Veuillez sélectionner une table'
            });
            return;
        }

        setLoading(true);

        try {
            // Préparer les agrégats pour l'envoi au backend
            const preparedAggregates = aggregates.map(agg => ({
                type: agg.type,
                columns: agg.columns,
                alias: agg.alias || undefined
            }));

            // Préparer les filtres (sans l'id ajouté côté frontend)
            const preparedFilters = filters.map(f => ({
                field: f.field,
                operator: f.operator,
                value: f.value
            }));

            // Préparer les tris (sans l'id ajouté côté frontend)
            const preparedSorting = sorting.map(s => ({
                field: s.field,
                direction: s.direction
            }));

            const requestBody = {
                username,
                password,
                table: selectedTable,
                columns: selectedColumns,
                filters: preparedFilters,
                sorting: preparedSorting,
                aggregates: preparedAggregates,
                page: page,
                pageSize: newPageSize || pagination.pageSize
            };

            console.log('Envoi au backend:', JSON.stringify(requestBody, null, 2));

            const response = await fetch(`${API_BASE_URL}/execute-query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (result.success) {
                setResult(result.data);
                setPagination(result.pagination || {
                    currentPage: page,
                    pageSize: newPageSize || pagination.pageSize,
                    totalCount: result.data.length,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false
                });

                toast.current.show({
                    severity: 'success',
                    summary: 'Requête exécutée',
                    detail: `${result.pagination?.totalCount || result.data.length} résultat(s) trouvé(s) - Page ${page}`
                });
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Erreur lors de l\'exécution:', error);
            toast.current.show({
                severity: 'error',
                summary: 'Erreur d\'exécution',
                detail: error.message
            });
        } finally {
            setLoading(false);
        }
    };

    // Navigation de pagination
    const goToPage = (page) => {
        if (page < 1 || page > pagination.totalPages) return;
        executeVisualQuery(page);
    };

    const changePageSize = (size) => {
        setPagination(prev => ({
            ...prev,
            pageSize: size,
            currentPage: 1 // Retour à la première page
        }));
        executeVisualQuery(1, size);
    };

    // Réinitialisation
    const resetQuery = () => {
        setSelectedTable(null);
        setSelectedColumns([]);
        setFilters([]);
        setSorting([]);
        setAggregates([]);
        setResult([]);
        setPagination({
            currentPage: 1,
            pageSize: 50,
            totalCount: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
        });
        setShowColumnsDropdown(true);
    };

    // Formater une valeur pour l'affichage
    const formatValue = (value) => {
        if (value === null || value === undefined) {
            return <span className="text-muted fst-italic">NULL</span>;
        }

        if (typeof value === 'number') {
            // Formatage des nombres
            if (Number.isInteger(value)) {
                return value.toLocaleString('fr-FR');
            } else {
                return value.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
        }

        return value.toString();
    };

    // Sélectionner/Désélectionner toutes les colonnes
    const toggleAllColumns = () => {
        const tableFields = tables[selectedTable]?.fields || [];
        if (selectedColumns.length === tableFields.length) {
            // Tout désélectionner
            setSelectedColumns([]);
        } else {
            // Tout sélectionner
            setSelectedColumns(tableFields.map(f => f.name));
        }
    };

    // Calculer les pages à afficher dans la pagination
    const getVisiblePages = () => {
        const { currentPage, totalPages } = pagination;
        const delta = 2;
        const range = [];
        const rangeWithDots = [];
        let l;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
                range.push(i);
            }
        }

        range.forEach((i) => {
            if (l) {
                if (i - l === 2) {
                    rangeWithDots.push(l + 1);
                } else if (i - l !== 1) {
                    rangeWithDots.push('...');
                }
            }
            rangeWithDots.push(i);
            l = i;
        });

        return rangeWithDots;
    };

    // Fonctions pour l'export/import des requêtes
    const exportQueries = () => {
        const dataStr = JSON.stringify(savedQueries, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

        const exportFileDefaultName = `requetes_sauvegardees_${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const importQueries = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    setSavedQueries(imported);
                    localStorage.setItem('savedQueries', JSON.stringify(imported));
                    toast.current.show({
                        severity: 'success',
                        summary: 'Import réussi',
                        detail: `${imported.length} requête(s) importée(s)`
                    });
                } else {
                    throw new Error('Format invalide');
                }
            } catch (error) {
                toast.current.show({
                    severity: 'error',
                    summary: 'Erreur d\'import',
                    detail: 'Le fichier n\'est pas valide'
                });
            }
        };
        reader.readAsText(file);

        // Reset le input file
        event.target.value = '';
    };

    return (
        <div className="app-container vh-100 vw-100 bg-light">
            <Toast ref={toast} position="top-right" />

            {/* Header */}
            <header className="bg-white shadow-sm border-bottom">
                <div className="container-fluid px-4">
                    <div className="d-flex justify-content-between align-items-center py-3">
                        <div className="d-flex align-items-center">
                            <i className="pi pi-table fs-3 text-primary me-3"></i>
                            <div>
                                <h1 className="h4 mb-0 text-dark fw-bold">Assistant de Requêtes Oracle</h1>
                                <small className="text-muted">Interface visuelle pour bases Oracle</small>
                            </div>
                        </div>
                        {connected && userInfo && (
                            <div className="d-flex align-items-center gap-3">
                                <div className="text-end">
                                    <div className="fw-semibold">{userInfo.USERNAME}</div>
                                    <small className="text-muted">
                                        {userInfo.TABLE_COUNT} table(s) | {userInfo.DEFAULT_TABLESPACE}
                                    </small>
                                </div>
                                <div className="d-flex gap-2">
                                    <button
                                        className="btn btn-outline-primary btn-sm"
                                        onClick={() => setShowLoadQueryDialog(true)}
                                        disabled={savedQueries.length === 0}
                                    >
                                        <i className="pi pi-folder me-1"></i>
                                        Mes requêtes
                                    </button>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => setShowSaveQueryDialog(true)}
                                        disabled={!selectedTable || result.length === 0}
                                    >
                                        <i className="pi pi-save me-1"></i>
                                        Sauvegarder
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Barre de connexion */}
            <div className="bg-light border-bottom py-2">
                <div className="container-fluid px-4">
                    <div className="row align-items-center g-2">
                        <div className="col-md-8">
                            {!connected ? (
                                <div className="d-flex align-items-center gap-3">
                                    <div className="input-group" style={{ maxWidth: '300px' }}>
                                        <span className="input-group-text">
                                            <i className="pi pi-user"></i>
                                        </span>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Nom d'utilisateur"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                    <div className="input-group" style={{ maxWidth: '300px' }}>
                                        <span className="input-group-text">
                                            <i className="pi pi-key"></i>
                                        </span>
                                        <input
                                            type="password"
                                            className="form-control"
                                            placeholder="Mot de passe"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="d-flex align-items-center gap-2">
                                    <span className="fw-semibold text-primary">
                                        <i className="pi pi-database me-1"></i>
                                        Connecté en tant que: {userInfo?.USERNAME}
                                    </span>
                                    {selectedTable && (
                                        <span className="text-muted small ms-3">
                                            Table active: <strong>{tables[selectedTable]?.name || selectedTable}</strong>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="col-md-4 text-end">
                            {!connected ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleConnect}
                                    disabled={(!username || !password) || loading}
                                >
                                    {loading ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2"></span>
                                            Connexion...
                                        </>
                                    ) : (
                                        <>
                                            <i className="pi pi-folder-open me-2"></i>
                                            Se connecter
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    className="btn btn-outline-secondary"
                                    onClick={handleDisconnect}
                                >
                                    <i className="pi pi-sign-out me-2"></i>
                                    Déconnexion
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <main className="container-fluid px-4 py-4">
                {connected ? (
                    selectedTable ? (
                        <div className="row">
                            {/* Sidebar de configuration */}
                            <div className="col-md-4 col-lg-3 mb-4">
                                <div className="card shadow-sm h-100">
                                    <div className="card-header bg-white border-bottom">
                                        <h5 className="mb-0">
                                            <i className="pi pi-cog me-2 text-primary"></i>
                                            Configuration
                                        </h5>
                                    </div>
                                    <div className="card-body p-3" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

                                        {/* Table sélectionnée */}
                                        <div className="mb-4">
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <h6 className="mb-0">
                                                    <i className="pi pi-table text-primary me-2"></i>
                                                    Table
                                                </h6>
                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={() => setShowTableDialog(true)}
                                                >
                                                    <i className="pi pi-pencil"></i>
                                                </button>
                                            </div>
                                            <div className="card bg-light">
                                                <div className="card-body py-2">
                                                    <div className="d-flex align-items-center">
                                                        <i className="pi pi-table text-primary me-2"></i>
                                                        <div>
                                                            <div className="fw-semibold">
                                                                {tables[selectedTable]?.name || selectedTable}
                                                            </div>
                                                            <small className="text-muted">
                                                                {selectedColumns.length} colonne(s) sélectionnée(s)
                                                            </small>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Colonnes à afficher - Dropdown */}
                                        <div className="mb-4">
                                            <div className="dropdown-section">
                                                <div className="d-flex justify-content-between align-items-center mb-2">
                                                    <button
                                                        className="btn btn-sm btn-outline-primary dropdown-toggle d-flex align-items-center w-100 justify-content-between"
                                                        onClick={() => setShowColumnsDropdown(!showColumnsDropdown)}
                                                    >
                                                        <span>
                                                            <i className="pi pi-list me-2 text-primary"></i>
                                                            Colonnes à afficher
                                                        </span>
                                                        <span className="badge bg-primary rounded-pill ms-2">
                                                            {selectedColumns.length}
                                                        </span>
                                                    </button>
                                                </div>

                                                {showColumnsDropdown && (
                                                    <div className="dropdown-content mt-2">
                                                        <div className="d-flex justify-content-between align-items-center mb-2 px-2">
                                                            <button
                                                                className="btn btn-sm btn-outline-secondary"
                                                                onClick={toggleAllColumns}
                                                            >
                                                                {selectedColumns.length === tables[selectedTable]?.fields?.length
                                                                    ? 'Tout désélectionner'
                                                                    : 'Tout sélectionner'}
                                                            </button>
                                                            <small className="text-muted">
                                                                {selectedColumns.length} sur {tables[selectedTable]?.fields?.length || 0}
                                                            </small>
                                                        </div>
                                                        <div className="list-group" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                                            {tables[selectedTable]?.fields?.map(field => (
                                                                <div key={field.name} className="list-group-item list-group-item-action p-2">
                                                                    <div className="form-check">
                                                                        <input
                                                                            className="form-check-input"
                                                                            type="checkbox"
                                                                            id={`col_${field.name}`}
                                                                            checked={selectedColumns.includes(field.name)}
                                                                            onChange={(e) => {
                                                                                if (e.target.checked) {
                                                                                    setSelectedColumns([...selectedColumns, field.name]);
                                                                                } else {
                                                                                    setSelectedColumns(selectedColumns.filter(c => c !== field.name));
                                                                                }
                                                                            }}
                                                                        />
                                                                        <label className="form-check-label w-100 ms-2" htmlFor={`col_${field.name}`}>
                                                                            <div className="fw-semibold">{field.label || formatColumnLabel(field.name)}</div>
                                                                            <small className={`badge ${field.type === 'number' ? 'bg-primary' : 'bg-secondary'}`}>
                                                                                {field.type}
                                                                            </small>
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Filtres */}
                                        <div className="mb-4">
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <h6 className="mb-0">
                                                    <i className="pi pi-filter me-2 text-info"></i>
                                                    Filtres
                                                </h6>
                                                <div>
                                                    <span className="badge bg-info rounded-pill me-2">
                                                        {filters.length}
                                                    </span>
                                                    <button
                                                        className="btn btn-sm btn-outline-info"
                                                        onClick={() => setShowFilterDialog(true)}
                                                    >
                                                        <i className="pi pi-plus"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            {filters.length === 0 ? (
                                                <div className="text-center py-3 text-muted">
                                                    <i className="pi pi-filter-slash d-block mb-2 fs-4"></i>
                                                    <small>Aucun filtre</small>
                                                </div>
                                            ) : (
                                                <div className="list-group">
                                                    {filters.map(filter => (
                                                        <div key={filter.id} className="list-group-item list-group-item-info p-2">
                                                            <div className="d-flex justify-content-between align-items-center">
                                                                <div>
                                                                    <div className="fw-semibold">{filter.label}</div>
                                                                    <small>{filter.operator} "{filter.value}"</small>
                                                                </div>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() => removeFilter(filter.id)}
                                                                >
                                                                    <i className="pi pi-times"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Tris */}
                                        <div className="mb-4">
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <h6 className="mb-0">
                                                    <i className="pi pi-sort-alt me-2 text-warning"></i>
                                                    Tris
                                                </h6>
                                                <div>
                                                    <span className="badge bg-warning rounded-pill me-2">
                                                        {sorting.length}
                                                    </span>
                                                    <button
                                                        className="btn btn-sm btn-outline-warning"
                                                        onClick={() => setShowSortDialog(true)}
                                                    >
                                                        <i className="pi pi-plus"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            {sorting.length === 0 ? (
                                                <div className="text-center py-3 text-muted">
                                                    <i className="pi pi-sort-alt-slash d-block mb-2 fs-4"></i>
                                                    <small>Aucun tri</small>
                                                </div>
                                            ) : (
                                                <div className="list-group">
                                                    {sorting.map(sort => (
                                                        <div key={sort.id} className="list-group-item list-group-item-warning p-2">
                                                            <div className="d-flex justify-content-between align-items-center">
                                                                <div>
                                                                    <div className="fw-semibold">{sort.label}</div>
                                                                    <small>{sort.direction === "ASC" ? "Croissant" : "Décroissant"}</small>
                                                                </div>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() => removeSort(sort.id)}
                                                                >
                                                                    <i className="pi pi-times"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Calculs */}
                                        <div className="mb-4">
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <h6 className="mb-0">
                                                    <i className="pi pi-calculator me-2 text-success"></i>
                                                    Calculs
                                                </h6>
                                                <div>
                                                    <span className="badge bg-success rounded-pill me-2">
                                                        {aggregates.length}
                                                    </span>
                                                    <button
                                                        className="btn btn-sm btn-outline-success"
                                                        onClick={() => setShowAggregateDialog(true)}
                                                    >
                                                        <i className="pi pi-plus"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            {aggregates.length === 0 ? (
                                                <div className="text-center py-3 text-muted">
                                                    <i className="pi pi-calculator d-block mb-2 fs-4"></i>
                                                    <small>Aucun calcul</small>
                                                </div>
                                            ) : (
                                                <div className="list-group">
                                                    {aggregates.map(agg => (
                                                        <div key={agg.id} className="list-group-item list-group-item-success p-2">
                                                            <div className="d-flex justify-content-between align-items-center">
                                                                <div>
                                                                    <div className="fw-semibold">{agg.label}</div>
                                                                    {agg.alias && <small>Alias: {agg.alias}</small>}
                                                                </div>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() => removeAggregate(agg.id)}
                                                                >
                                                                    <i className="pi pi-times"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Boutons d'action */}
                                        <div className="border-top pt-3">
                                            <div className="row g-2">
                                                <div className="col-6">
                                                    <button
                                                        className="btn btn-outline-danger w-100"
                                                        onClick={resetQuery}
                                                    >
                                                        <i className="pi pi-refresh me-1"></i>
                                                        Tout effacer
                                                    </button>
                                                </div>
                                                <div className="col-6">
                                                    <button
                                                        className="btn btn-success w-100"
                                                        onClick={() => executeVisualQuery(1)}
                                                        disabled={loading}
                                                    >
                                                        {loading ? (
                                                            <>
                                                                <span className="spinner-border spinner-border-sm me-1"></span>
                                                                Exécution...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <i className="pi pi-play me-1"></i>
                                                                Exécuter
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Zone de résultats */}
                            <div className="col-md-7 col-lg-9">
                                <div className="card shadow-sm h-100 d-flex flex-column">
                                    <div className="card-header bg-white border-bottom">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <h5 className="mb-0">
                                                <i className="pi pi-chart-bar me-2 text-primary"></i>
                                                Résultats
                                            </h5>
                                            <div className="d-flex gap-2">
                                                <div className="btn-group">
                                                    <button className="btn btn-outline-primary btn-sm" onClick={() => setShowTableDialog(true)}>
                                                        <i className="pi pi-table me-1"></i>Table
                                                    </button>
                                                    <button className="btn btn-outline-primary btn-sm" onClick={() => setShowFilterDialog(true)}>
                                                        <i className="pi pi-filter me-1"></i>Filtre
                                                    </button>
                                                    <button className="btn btn-outline-primary btn-sm" onClick={() => setShowSortDialog(true)}>
                                                        <i className="pi pi-sort-alt me-1"></i>Tri
                                                    </button>
                                                    <button className="btn btn-outline-primary btn-sm" onClick={() => setShowAggregateDialog(true)}>
                                                        <i className="pi pi-calculator me-1"></i>Calcul
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="card-body p-0 position-relative flex-grow-1">
                                        {loading ? (
                                            <div className="d-flex justify-content-center align-items-center h-100">
                                                <div className="text-center">
                                                    <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
                                                        <span className="visually-hidden">Chargement...</span>
                                                    </div>
                                                    <p className="mt-3 text-muted">Chargement des données...</p>
                                                </div>
                                            </div>
                                        ) : result.length > 0 ? (
                                            <>
                                                <div className="table-responsive" style={{ height: 'calc(100% - 70px)', maxHeight: '60vh' }}>
                                                    <table className="table table-hover table-striped mb-0">
                                                        <thead className="table-light sticky-top">
                                                        <tr>
                                                            {result[0] && Object.keys(result[0]).map(key => {
                                                                const isCalculated = aggregates.some(agg => {
                                                                    const generatedAlias = agg.type === 'SUM' ? `sum_${agg.columns.join('_')}` :
                                                                        agg.type === 'AVG' ? `avg_${agg.columns.join('_')}` :
                                                                            `count_${agg.columns.join('_') || 'all'}`;

                                                                    return key === (agg.alias || generatedAlias);
                                                                });

                                                                return (
                                                                    <th key={key} className="text-nowrap">
                                                                        <div className="d-flex align-items-center">
                                                                            {formatColumnLabel(key)}
                                                                            {isCalculated && (
                                                                                <span className="ms-1 badge bg-success" style={{ fontSize: '0.6rem' }}>
                                                                                    <i className="pi pi-calculator"></i>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {isCalculated && (
                                                                            <small className="d-block text-muted" style={{ fontSize: '0.7rem' }}>
                                                                                {getAggregateLabelForColumn(key)}
                                                                            </small>
                                                                        )}
                                                                    </th>
                                                                );
                                                            })}
                                                        </tr>
                                                        </thead>
                                                        <tbody>
                                                        {result.map((row, index) => (
                                                            <tr key={index}>
                                                                {Object.values(row).map((value, colIndex) => (
                                                                    <td key={colIndex} className="text-nowrap">
                                                                        {formatValue(value)}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Pagination */}
                                                <div className="border-top bg-white">
                                                    <div className="d-flex justify-content-between align-items-center p-3">
                                                        <div className="d-flex align-items-center">
                                                            <span className="text-muted me-3">
                                                                Affichage de <strong>{(pagination.currentPage - 1) * pagination.pageSize + 1}</strong> à <strong>{Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)}</strong> sur <strong>{pagination.totalCount.toLocaleString('fr-FR')}</strong> résultats
                                                            </span>

                                                            <div className="d-flex align-items-center me-3">
                                                                <label className="form-label mb-0 me-2">Lignes par page:</label>
                                                                <select
                                                                    className="form-select form-select-sm w-auto"
                                                                    value={pagination.pageSize}
                                                                    onChange={(e) => changePageSize(parseInt(e.target.value))}
                                                                >
                                                                    {pageSizeOptions.map(size => (
                                                                        <option key={size} value={size}>{size}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>

                                                        <nav aria-label="Pagination">
                                                            <ul className="pagination pagination-sm mb-0">
                                                                <li className={`page-item ${!pagination.hasPrevPage ? 'disabled' : ''}`}>
                                                                    <button
                                                                        className="page-link"
                                                                        onClick={() => goToPage(1)}
                                                                        disabled={!pagination.hasPrevPage}
                                                                    >
                                                                        <i className="pi pi-angle-double-left"></i>
                                                                    </button>
                                                                </li>
                                                                <li className={`page-item ${!pagination.hasPrevPage ? 'disabled' : ''}`}>
                                                                    <button
                                                                        className="page-link"
                                                                        onClick={() => goToPage(pagination.currentPage - 1)}
                                                                        disabled={!pagination.hasPrevPage}
                                                                    >
                                                                        <i className="pi pi-angle-left"></i>
                                                                    </button>
                                                                </li>

                                                                {getVisiblePages().map((pageNum, index) => (
                                                                    <li
                                                                        key={index}
                                                                        className={`page-item ${pageNum === '...' ? 'disabled' : ''} ${pageNum === pagination.currentPage ? 'active' : ''}`}
                                                                    >
                                                                        {pageNum === '...' ? (
                                                                            <span className="page-link">...</span>
                                                                        ) : (
                                                                            <button
                                                                                className="page-link"
                                                                                onClick={() => goToPage(pageNum)}
                                                                            >
                                                                                {pageNum}
                                                                            </button>
                                                                        )}
                                                                    </li>
                                                                ))}

                                                                <li className={`page-item ${!pagination.hasNextPage ? 'disabled' : ''}`}>
                                                                    <button
                                                                        className="page-link"
                                                                        onClick={() => goToPage(pagination.currentPage + 1)}
                                                                        disabled={!pagination.hasNextPage}
                                                                    >
                                                                        <i className="pi pi-angle-right"></i>
                                                                    </button>
                                                                </li>
                                                                <li className={`page-item ${!pagination.hasNextPage ? 'disabled' : ''}`}>
                                                                    <button
                                                                        className="page-link"
                                                                        onClick={() => goToPage(pagination.totalPages)}
                                                                        disabled={!pagination.hasNextPage}
                                                                    >
                                                                        <i className="pi pi-angle-double-right"></i>
                                                                    </button>
                                                                </li>
                                                            </ul>
                                                        </nav>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center py-5 h-100 d-flex flex-column justify-content-center">
                                                <i className="pi pi-chart-line text-muted mb-3" style={{ fontSize: '3rem' }}></i>
                                                <h5 className="text-muted mb-2">Aucun résultat à afficher</h5>
                                                <p className="text-muted mb-3">
                                                    Configurez votre requête et cliquez sur "Exécuter"
                                                </p>
                                                <div className="text-center">
                                                    <button
                                                        className="btn btn-success w-50"
                                                        onClick={() => executeVisualQuery(1)}
                                                        disabled={loading}
                                                    >
                                                        <i className="pi pi-play me-2"></i>
                                                        Exécuter la requête
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Sélection de table */
                        <div className="row justify-content-center">
                            <div className="col-lg-6">
                                <div className="card shadow-sm">
                                    <div className="card-body text-center py-5">
                                        <i className="pi pi-table text-primary mb-3" style={{ fontSize: '4rem' }}></i>
                                        <h3 className="card-title mb-3">Sélectionnez une table</h3>
                                        <p className="card-text text-muted mb-4">
                                            Choisissez une table pour commencer à construire votre requête.
                                        </p>
                                        <button
                                            className="btn btn-primary btn-lg"
                                            onClick={() => setShowTableDialog(true)}
                                            disabled={loadingTables}
                                        >
                                            {loadingTables ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2"></span>
                                                    Chargement des tables...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="pi pi-table me-2"></i>
                                                    Choisir une table
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                ) : (
                    /* Page d'accueil */
                    <div className="row justify-content-center">
                        <div className="col-lg-8">
                            <div className="card shadow-sm">
                                <div className="card-body text-center py-5">
                                    <i className="pi pi-chart-line text-primary mb-4" style={{ fontSize: '4rem' }}></i>
                                    <h2 className="card-title mb-3">Assistant de Requêtes Oracle</h2>
                                    <p className="card-text text-muted mb-4">
                                        Interface visuelle pour extraire des données Oracle sans connaissance SQL.
                                    </p>
                                    <div className="row g-4 mt-4">
                                        <div className="col-md-3">
                                            <div className="text-center">
                                                <i className="pi pi-database text-primary mb-2" style={{ fontSize: '2rem' }}></i>
                                                <h6 className="mb-0">Oracle réelle</h6>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="text-center">
                                                <i className="pi pi-th-large text-primary mb-2" style={{ fontSize: '2rem' }}></i>
                                                <h6 className="mb-0">Sélection visuelle</h6>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="text-center">
                                                <i className="pi pi-filter text-primary mb-2" style={{ fontSize: '2rem' }}></i>
                                                <h6 className="mb-0">Filtres intuitifs</h6>
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            <div className="text-center">
                                                <i className="pi pi-calculator text-primary mb-2" style={{ fontSize: '2rem' }}></i>
                                                <h6 className="mb-0">Calculs avancés</h6>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Modal pour choisir une table */}
            {showTableDialog && (
                <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-lg">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <i className="pi pi-table me-2"></i>
                                    Choisir une table
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowTableDialog(false)}></button>
                            </div>
                            <div className="modal-body">
                                {Object.keys(tables || {}).length === 0 ? (
                                    <div className="text-center py-5">
                                        <i className="pi pi-database text-muted mb-3" style={{ fontSize: '3rem' }}></i>
                                        <h5 className="text-muted mb-2">Aucune table disponible</h5>
                                        <p className="text-muted">
                                            Aucune table n'a été trouvée dans votre schéma.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="row g-3">
                                        {Object.entries(tables || {}).map(([key, table]) => (
                                            <div key={key} className="col-4 col-md-3 col-lg-2">
                                                <div
                                                    className="table-selector-card card text-center cursor-pointer position-relative"
                                                    onClick={() => handleTableSelect(key)}
                                                    style={{
                                                        cursor: 'pointer',
                                                        aspectRatio: '1/1',
                                                        border: '1px solid #dee2e6',
                                                        overflow: 'visible'
                                                    }}
                                                >
                                                    <div className="card-body p-2 d-flex flex-column align-items-center justify-content-center">
                                                        <div className="mb-2">
                                                            <i className="pi pi-table text-primary" style={{ fontSize: '2.2rem' }}></i>
                                                        </div>
                                                        <div className="mt-auto w-100 position-relative">
                                                            <small className="text-dark text-truncate d-block fw-medium"
                                                                   style={{
                                                                       fontSize: '0.75rem',
                                                                       maxWidth: '100%',
                                                                       lineHeight: '1.1'
                                                                   }}>
                                                                {table.name}
                                                            </small>

                                                            {/* Tooltip qui sort du carré */}
                                                            <div className="table-tooltip">
                                                                {table.name}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <div className="d-flex justify-content-between w-100 align-items-center">
                                    <div className="text-muted small">
                                        <i className="pi pi-info-circle me-1"></i>
                                        {Object.keys(tables || {}).length} table(s) - Survolez pour voir les noms complets
                                    </div>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowTableDialog(false)}>
                                        Annuler
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Les modals pour filtres, tris, calculs, sauvegarde... */}
            {/* Modal pour ajouter un filtre */}
            {showFilterDialog && (
                <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <i className="pi pi-filter me-2"></i>
                                    Ajouter un filtre
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowFilterDialog(false)}></button>
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label">Colonne</label>
                                    <select
                                        className="form-select"
                                        value={currentFilter.field}
                                        onChange={(e) => setCurrentFilter({...currentFilter, field: e.target.value})}
                                    >
                                        <option value="">Sélectionnez une colonne</option>
                                        {getFieldOptions().map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Opérateur</label>
                                    <select
                                        className="form-select"
                                        value={currentFilter.operator}
                                        onChange={(e) => setCurrentFilter({...currentFilter, operator: e.target.value})}
                                    >
                                        <option value="=">Égal à</option>
                                        <option value="!=">Différent de</option>
                                        <option value=">">Supérieur à</option>
                                        <option value="<">Inférieur à</option>
                                        <option value=">=">Supérieur ou égal à</option>
                                        <option value="<=">Inférieur ou égal à</option>
                                        <option value="contient">Contient</option>
                                        <option value="commence par">Commence par</option>
                                        <option value="termine par">Termine par</option>
                                        <option value="est null">Est vide (NULL)</option>
                                        <option value="n'est pas null">N'est pas vide</option>
                                    </select>
                                </div>
                                {currentFilter.operator !== 'est null' && currentFilter.operator !== 'n\'est pas null' && (
                                    <div className="mb-3">
                                        <label className="form-label">Valeur</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={currentFilter.value}
                                            onChange={(e) => setCurrentFilter({...currentFilter, value: e.target.value})}
                                            placeholder="Entrez la valeur"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowFilterDialog(false)}>
                                    Annuler
                                </button>
                                <button type="button" className="btn btn-primary" onClick={addFilter}>
                                    Ajouter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal pour ajouter un tri */}
            {showSortDialog && (
                <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <i className="pi pi-sort-alt me-2"></i>
                                    Ajouter un tri
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowSortDialog(false)}></button>
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label">Colonne</label>
                                    <select
                                        className="form-select"
                                        value={currentSort.field}
                                        onChange={(e) => setCurrentSort({...currentSort, field: e.target.value})}
                                    >
                                        <option value="">Sélectionnez une colonne</option>
                                        {getFieldOptions().map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Ordre</label>
                                    <select
                                        className="form-select"
                                        value={currentSort.direction}
                                        onChange={(e) => setCurrentSort({...currentSort, direction: e.target.value})}
                                    >
                                        <option value="ASC">Croissant (A-Z)</option>
                                        <option value="DESC">Décroissant (Z-A)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowSortDialog(false)}>
                                    Annuler
                                </button>
                                <button type="button" className="btn btn-primary" onClick={addSort}>
                                    Ajouter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal pour ajouter un calcul */}
            {showAggregateDialog && (
                <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <i className="pi pi-calculator me-2"></i>
                                    Ajouter un calcul
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowAggregateDialog(false)}></button>
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label">Type de calcul</label>
                                    <select
                                        className="form-select"
                                        value={currentAggregate.type}
                                        onChange={(e) => setCurrentAggregate({...currentAggregate, type: e.target.value, columns: []})}
                                    >
                                        <option value="">Sélectionnez un type</option>
                                        <option value="SUM">Somme</option>
                                        <option value="AVG">Moyenne</option>
                                        <option value="COUNT">Compte</option>
                                    </select>
                                </div>
                                {currentAggregate.type && currentAggregate.type !== 'COUNT' && (
                                    <div className="mb-3">
                                        <label className="form-label">Colonnes à calculer</label>
                                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                            {getNumericFieldOptions().map(option => (
                                                <div key={option.value} className="form-check">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id={`agg_${option.value}`}
                                                        checked={currentAggregate.columns.includes(option.value)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setCurrentAggregate({
                                                                    ...currentAggregate,
                                                                    columns: [...currentAggregate.columns, option.value]
                                                                });
                                                            } else {
                                                                setCurrentAggregate({
                                                                    ...currentAggregate,
                                                                    columns: currentAggregate.columns.filter(col => col !== option.value)
                                                                });
                                                            }
                                                        }}
                                                    />
                                                    <label className="form-check-label" htmlFor={`agg_${option.value}`}>
                                                        {option.label}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="mb-3">
                                    <label className="form-label">Alias (optionnel)</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={currentAggregate.alias}
                                        onChange={(e) => setCurrentAggregate({...currentAggregate, alias: e.target.value})}
                                        placeholder="Nom de la colonne calculée"
                                    />
                                    <small className="text-muted">
                                        Si vide, un nom sera généré automatiquement
                                    </small>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAggregateDialog(false)}>
                                    Annuler
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={addAggregate}
                                    disabled={!currentAggregate.type || (currentAggregate.type !== 'COUNT' && currentAggregate.columns.length === 0)}
                                >
                                    Ajouter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}