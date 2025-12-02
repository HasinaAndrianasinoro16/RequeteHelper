import React, { useState, useRef, useEffect } from "react";
import { Toast } from "primereact/toast";

import "primereact/resources/themes/lara-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

export default function App() {
    const toast = useRef();
    const [selectedDb, setSelectedDb] = useState(null);
    const [connected, setConnected] = useState(false);
    const [result, setResult] = useState([]);
    const [loading, setLoading] = useState(false);

    // États pour l'interface visuelle
    const [selectedTable, setSelectedTable] = useState(null);
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [filters, setFilters] = useState([]);
    const [sorting, setSorting] = useState([]);
    const [aggregates, setAggregates] = useState([]);

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
        // Charger depuis le localStorage au démarrage
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

    // Structure initiale des bases de données
    const [businessDatabases, setBusinessDatabases] = useState({
        "COMPTABILITE": {
            name: "Base Comptabilité",
            description: "Données financières et comptables",
            tables: {}
        },
        "VENTES": {
            name: "Base Ventes",
            description: "Données commerciales et ventes",
            tables: {}
        }
    });

    const databases = Object.keys(businessDatabases).map(key => ({
        label: businessDatabases[key].name,
        value: key,
        description: businessDatabases[key].description
    }));

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
        if (!selectedDb) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/test-connection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ schema: selectedDb })
            });

            const result = await response.json();

            if (result.success) {
                // Charger les métadonnées des tables
                const tablesResponse = await fetch(`${API_BASE_URL}/tables/${selectedDb}`);
                const tablesData = await tablesResponse.json();

                setBusinessDatabases(prev => ({
                    ...prev,
                    [selectedDb]: {
                        ...prev[selectedDb],
                        tables: tablesData
                    }
                }));

                setConnected(true);
                toast.current.show({
                    severity: 'success',
                    summary: 'Connecté',
                    detail: `Base ${businessDatabases[selectedDb].name} ouverte`
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

    const handleDisconnect = () => {
        setConnected(false);
        setSelectedDb(null);
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
        const tableFields = businessDatabases[selectedDb].tables[tableKey]?.fields || [];
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
            detail: businessDatabases[selectedDb].tables[tableKey]?.name || tableKey
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
        if (!selectedDb || !selectedTable) return [];
        const table = businessDatabases[selectedDb].tables[selectedTable];
        return table?.fields?.map(field => ({
            label: field.label || formatColumnLabel(field.name),
            value: field.name,
            type: field.type
        })) || [];
    };

    // Options pour les colonnes numériques
    const getNumericFieldOptions = () => {
        if (!selectedDb || !selectedTable) return [];
        const table = businessDatabases[selectedDb].tables[selectedTable];
        return table?.fields
            ?.filter(field => {
                // Inclure les types numériques
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
                schema: selectedDb,
                table: selectedTable,
                columns: selectedColumns,
                filters: preparedFilters,
                sorting: preparedSorting,
                aggregates: preparedAggregates,
                page: page,
                pageSize: newPageSize || pagination.pageSize
            };

            console.log('Envoi au backend avec pagination:', JSON.stringify(requestBody, null, 2));

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
        const tableFields = businessDatabases[selectedDb].tables[selectedTable]?.fields || [];
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
                                <h1 className="h4 mb-0 text-dark fw-bold">Assistant de Requêtes Métier</h1>
                                <small className="text-muted">Interface visuelle pour bases Oracle</small>
                            </div>
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
                </div>
            </header>

            {/* Barre de connexion */}
            <div className="bg-light border-bottom py-2">
                <div className="container-fluid px-4">
                    <div className="row align-items-center g-2">
                        <div className="col-md-8">
                            <div className="d-flex align-items-center gap-2">
                                <select
                                    className="form-select w-auto"
                                    value={selectedDb || ""}
                                    onChange={e => setSelectedDb(e.target.value)}
                                    disabled={connected}
                                >
                                    <option value="">Choisir une base de données...</option>
                                    {databases.map(db => (
                                        <option key={db.value} value={db.value}>
                                            {db.label}
                                        </option>
                                    ))}
                                </select>
                                {selectedDb && (
                                    <span className="text-muted small">
                                        {businessDatabases[selectedDb].description}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="col-md-4 text-end">
                            {!connected ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleConnect}
                                    disabled={!selectedDb || loading}
                                >
                                    {loading ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2"></span>
                                            Connexion...
                                        </>
                                    ) : (
                                        <>
                                            <i className="pi pi-folder-open me-2"></i>
                                            Ouvrir la base
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    className="btn btn-outline-secondary"
                                    onClick={handleDisconnect}
                                >
                                    <i className="pi pi-sync me-2"></i>
                                    Changer de base
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
                                                                {businessDatabases[selectedDb].tables[selectedTable]?.name || selectedTable}
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
                                                                {selectedColumns.length === businessDatabases[selectedDb].tables[selectedTable]?.fields?.length
                                                                    ? 'Tout désélectionner'
                                                                    : 'Tout sélectionner'}
                                                            </button>
                                                            <small className="text-muted">
                                                                {selectedColumns.length} sur {businessDatabases[selectedDb].tables[selectedTable]?.fields?.length || 0}
                                                            </small>
                                                        </div>
                                                        <div className="list-group" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                                            {businessDatabases[selectedDb].tables[selectedTable]?.fields?.map(field => (
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
                            <div className="col-md-8 col-lg-9">
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
                                        >
                                            <i className="pi pi-table me-2"></i>
                                            Choisir une table
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
                                    <h2 className="card-title mb-3">Assistant de Requêtes Métier</h2>
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
                                <div className="row g-3">
                                    {Object.entries(businessDatabases[selectedDb]?.tables || {}).map(([key, table]) => (
                                        <div key={key} className="col-md-6">
                                            <div
                                                className="card h-100 cursor-pointer hover-shadow"
                                                onClick={() => handleTableSelect(key)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="card-body">
                                                    <div className="d-flex align-items-start">
                                                        <i className="pi pi-table text-primary me-3 mt-1"></i>
                                                        <div>
                                                            <h6 className="card-title mb-1">{table.name}</h6>
                                                            <p className="card-text text-muted small mb-1">{table.description}</p>
                                                            <small className="text-muted">{table.fields?.length || 0} colonnes</small>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowTableDialog(false)}>
                                    Annuler
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                                        <option value="">Choisir une colonne...</option>
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
                                        <option value="=">Égal à </option>
                                        <option value="!=">Différent de </option>
                                        <option value=">">Supérieur à </option>
                                        <option value="<">Inférieur à </option>
                                        <option value=">=">Supérieur ou égal </option>
                                        <option value="<=">Inférieur ou égal </option>
                                        <option value="contient">Contient</option>
                                    </select>
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Valeur</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={currentFilter.value}
                                        onChange={(e) => setCurrentFilter({...currentFilter, value: e.target.value})}
                                        placeholder="Saisir la valeur..."
                                    />
                                </div>
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
                                    <label className="form-label">Colonne à trier</label>
                                    <select
                                        className="form-select"
                                        value={currentSort.field}
                                        onChange={(e) => setCurrentSort({...currentSort, field: e.target.value})}
                                    >
                                        <option value="">Choisir une colonne...</option>
                                        {getFieldOptions().map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Ordre de tri</label>
                                    <div>
                                        <div className="form-check">
                                            <input
                                                className="form-check-input"
                                                type="radio"
                                                name="sortDirection"
                                                id="sortAsc"
                                                value="ASC"
                                                checked={currentSort.direction === "ASC"}
                                                onChange={(e) => setCurrentSort({...currentSort, direction: e.target.value})}
                                            />
                                            <label className="form-check-label" htmlFor="sortAsc">
                                                Croissant (A-Z, 0-9)
                                            </label>
                                        </div>
                                        <div className="form-check">
                                            <input
                                                className="form-check-input"
                                                type="radio"
                                                name="sortDirection"
                                                id="sortDesc"
                                                value="DESC"
                                                checked={currentSort.direction === "DESC"}
                                                onChange={(e) => setCurrentSort({...currentSort, direction: e.target.value})}
                                            />
                                            <label className="form-check-label" htmlFor="sortDesc">
                                                Décroissant (Z-A, 9-0)
                                            </label>
                                        </div>
                                    </div>
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
                                        onChange={(e) => setCurrentAggregate({...currentAggregate, type: e.target.value})}
                                    >
                                        <option value="">Choisir un type de calcul...</option>
                                        <option value="SUM">Somme (addition)</option>
                                        <option value="AVG">Moyenne</option>
                                        <option value="COUNT">Compte</option>
                                    </select>
                                </div>

                                <div className="mb-3">
                                    <label className="form-label">
                                        {currentAggregate.type === 'COUNT'
                                            ? 'Colonne à compter (optionnel)'
                                            : 'Colonne(s) numérique(s)'}
                                    </label>
                                    <div className="border rounded p-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {currentAggregate.type === 'COUNT' ? (
                                            <>
                                                <div className="form-check mb-2">
                                                    <input
                                                        className="form-check-input"
                                                        type="radio"
                                                        name="countType"
                                                        id="countAll"
                                                        checked={currentAggregate.columns.length === 0}
                                                        onChange={() => setCurrentAggregate({
                                                            ...currentAggregate,
                                                            columns: []
                                                        })}
                                                    />
                                                    <label className="form-check-label" htmlFor="countAll">
                                                        Compter tous les enregistrements (COUNT(*))
                                                    </label>
                                                </div>
                                                <div className="form-check mb-2">
                                                    <input
                                                        className="form-check-input"
                                                        type="radio"
                                                        name="countType"
                                                        id="countColumn"
                                                        checked={currentAggregate.columns.length > 0}
                                                        onChange={() => {}}
                                                    />
                                                    <label className="form-check-label" htmlFor="countColumn">
                                                        Compter une colonne spécifique
                                                    </label>
                                                </div>
                                                {currentAggregate.columns.length > 0 && (
                                                    <div className="ms-4 mt-2">
                                                        {getFieldOptions().map(field => (
                                                            <div key={field.value} className="form-check mb-2">
                                                                <input
                                                                    className="form-check-input"
                                                                    type="checkbox"
                                                                    id={`count_${field.value}`}
                                                                    checked={currentAggregate.columns.includes(field.value)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setCurrentAggregate({
                                                                                ...currentAggregate,
                                                                                columns: [field.value]
                                                                            });
                                                                        } else {
                                                                            setCurrentAggregate({
                                                                                ...currentAggregate,
                                                                                columns: []
                                                                            });
                                                                        }
                                                                    }}
                                                                />
                                                                <label className="form-check-label" htmlFor={`count_${field.value}`}>
                                                                    {field.label}
                                                                </label>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        ) : currentAggregate.type === 'SUM' || currentAggregate.type === 'AVG' ? (
                                            getNumericFieldOptions().length > 0 ? (
                                                getNumericFieldOptions().map(field => (
                                                    <div key={field.value} className="form-check mb-2">
                                                        <input
                                                            className="form-check-input"
                                                            type="checkbox"
                                                            id={`agg_${field.value}`}
                                                            checked={currentAggregate.columns.includes(field.value)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setCurrentAggregate({
                                                                        ...currentAggregate,
                                                                        columns: [...currentAggregate.columns, field.value]
                                                                    });
                                                                } else {
                                                                    setCurrentAggregate({
                                                                        ...currentAggregate,
                                                                        columns: currentAggregate.columns.filter(c => c !== field.value)
                                                                    });
                                                                }
                                                            }}
                                                        />
                                                        <label className="form-check-label text-primary fw-semibold" htmlFor={`agg_${field.value}`}>
                                                            {field.label}
                                                        </label>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-3 text-muted">
                                                    <i className="pi pi-exclamation-circle me-2"></i>
                                                    Aucune colonne numérique disponible dans cette table
                                                </div>
                                            )
                                        ) : null}
                                    </div>
                                </div>

                                <div className="mb-3">
                                    <label className="form-label">Nom personnalisé (alias)</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={currentAggregate.alias}
                                        onChange={(e) => setCurrentAggregate({...currentAggregate, alias: e.target.value})}
                                        placeholder="Ex: total_ventes, moyenne_salaire..."
                                    />
                                    <small className="text-muted">
                                        Laissé vide pour un nom automatique
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
                                    disabled={!currentAggregate.type ||
                                        (currentAggregate.type !== 'COUNT' && currentAggregate.columns.length === 0)}
                                >
                                    Ajouter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal pour sauvegarder une requête */}
            {showSaveQueryDialog && (
                <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <i className="pi pi-save me-2 text-primary"></i>
                                    Sauvegarder la requête
                                </h5>
                                <button type="button" className="btn-close" onClick={() => {
                                    setShowSaveQueryDialog(false);
                                    setQueryName("");
                                    setQueryDescription("");
                                }}></button>
                            </div>
                            <div className="modal-body">
                                <div className="mb-3">
                                    <label className="form-label">Nom de la requête *</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={queryName}
                                        onChange={(e) => setQueryName(e.target.value)}
                                        placeholder="Ex: Rapport ventes mensuelles"
                                        maxLength={100}
                                    />
                                    <div className="form-text">
                                        Donnez un nom descriptif à votre requête
                                    </div>
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Description (optionnel)</label>
                                    <textarea
                                        className="form-control"
                                        rows="3"
                                        value={queryDescription}
                                        onChange={(e) => setQueryDescription(e.target.value)}
                                        placeholder="Décrivez le but de cette requête..."
                                        maxLength={500}
                                    />
                                </div>
                                <div className="alert alert-info">
                                    <i className="pi pi-info-circle me-2"></i>
                                    <small>
                                        La requête sera sauvegardée dans votre navigateur (localStorage).
                                        Elle contiendra la table, les colonnes, filtres, tris et calculs sélectionnés.
                                    </small>
                                </div>
                                <div className="small text-muted">
                                    <strong>Détails de la requête :</strong><br />
                                    • Base: {businessDatabases[selectedDb]?.name}<br />
                                    • Table: {businessDatabases[selectedDb]?.tables[selectedTable]?.name}<br />
                                    • Colonnes: {selectedColumns.length}<br />
                                    • Filtres: {filters.length}<br />
                                    • Tris: {sorting.length}<br />
                                    • Calculs: {aggregates.length}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => {
                                    setShowSaveQueryDialog(false);
                                    setQueryName("");
                                    setQueryDescription("");
                                }}>
                                    Annuler
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                        if (!queryName.trim()) {
                                            toast.current.show({
                                                severity: 'warn',
                                                summary: 'Nom manquant',
                                                detail: 'Veuillez donner un nom à votre requête'
                                            });
                                            return;
                                        }

                                        const newQuery = {
                                            id: `query_${Date.now()}`,
                                            name: queryName,
                                            description: queryDescription,
                                            date: new Date().toISOString(),
                                            schema: selectedDb,
                                            table: selectedTable,
                                            columns: [...selectedColumns],
                                            filters: [...filters],
                                            sorting: [...sorting],
                                            aggregates: [...aggregates],
                                            resultCount: result.length,
                                            pagination: { ...pagination }
                                        };

                                        // Sauvegarder dans le localStorage
                                        const updatedQueries = [...savedQueries, newQuery];
                                        setSavedQueries(updatedQueries);
                                        localStorage.setItem('savedQueries', JSON.stringify(updatedQueries));

                                        setShowSaveQueryDialog(false);
                                        setQueryName("");
                                        setQueryDescription("");

                                        toast.current.show({
                                            severity: 'success',
                                            summary: 'Requête sauvegardée',
                                            detail: `"${queryName}" a été sauvegardée`
                                        });
                                    }}
                                >
                                    <i className="pi pi-save me-1"></i>
                                    Sauvegarder
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal pour charger une requête */}
            {showLoadQueryDialog && (
                <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-lg">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <i className="pi pi-folder me-2 text-primary"></i>
                                    Mes requêtes sauvegardées
                                </h5>
                                <button type="button" className="btn-close" onClick={() => setShowLoadQueryDialog(false)}></button>
                            </div>
                            <div className="modal-body">
                                {savedQueries.length === 0 ? (
                                    <div className="text-center py-5">
                                        <i className="pi pi-inbox text-muted mb-3" style={{ fontSize: '3rem' }}></i>
                                        <h5 className="text-muted mb-2">Aucune requête sauvegardée</h5>
                                        <p className="text-muted">
                                            Créez et sauvegardez des requêtes pour les retrouver ici
                                        </p>
                                    </div>
                                ) : (
                                    <div className="list-group">
                                        {savedQueries.map((query, index) => (
                                            <div key={query.id} className="list-group-item list-group-item-action query-list-item">
                                                <div className="d-flex justify-content-between align-items-start">
                                                    <div className="flex-grow-1">
                                                        <div className="d-flex align-items-center mb-1">
                                                            <i className="pi pi-file text-primary me-2"></i>
                                                            <h6 className="mb-0 fw-bold">{query.name}</h6>
                                                            <span className="badge bg-secondary ms-2">
                                                                {businessDatabases[query.schema]?.name || query.schema}
                                                            </span>
                                                        </div>
                                                        {query.description && (
                                                            <p className="small text-muted mb-2">{query.description}</p>
                                                        )}
                                                        <div className="small text-muted mb-2">
                                                            <i className="pi pi-table me-1"></i>
                                                            Table: {businessDatabases[query.schema]?.tables[query.table]?.name || query.table}
                                                            • {query.columns?.length || 0} colonnes
                                                            • {query.filters?.length || 0} filtres
                                                            • {query.sorting?.length || 0} tris
                                                            • {query.aggregates?.length || 0} calculs
                                                            {query.resultCount > 0 && ` • ${query.resultCount} résultats`}
                                                        </div>
                                                        <div className="small text-muted">
                                                            <i className="pi pi-calendar me-1"></i>
                                                            Sauvegardé le {new Date(query.date).toLocaleDateString('fr-FR')} à {new Date(query.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                    <div className="d-flex flex-column gap-1 ms-3 query-actions">
                                                        <button
                                                            className="btn btn-sm btn-outline-primary"
                                                            onClick={() => {
                                                                // Charger la requête
                                                                if (query.schema !== selectedDb) {
                                                                    setSelectedDb(query.schema);
                                                                    toast.current.show({
                                                                        severity: 'info',
                                                                        summary: 'Base modifiée',
                                                                        detail: `Changement vers ${businessDatabases[query.schema]?.name}`
                                                                    });
                                                                }

                                                                setSelectedTable(query.table);
                                                                setSelectedColumns(query.columns || []);
                                                                setFilters(query.filters || []);
                                                                setSorting(query.sorting || []);
                                                                setAggregates(query.aggregates || []);
                                                                setPagination({
                                                                    currentPage: 1,
                                                                    pageSize: 50,
                                                                    totalCount: 0,
                                                                    totalPages: 0,
                                                                    hasNextPage: false,
                                                                    hasPrevPage: false
                                                                });
                                                                setResult([]);
                                                                setShowLoadQueryDialog(false);

                                                                toast.current.show({
                                                                    severity: 'success',
                                                                    summary: 'Requête chargée',
                                                                    detail: `"${query.name}" a été chargée`
                                                                });
                                                            }}
                                                        >
                                                            <i className="pi pi-play me-1"></i> Charger
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-outline-danger"
                                                            onClick={() => {
                                                                // Supprimer la requête
                                                                const updatedQueries = savedQueries.filter((_, i) => i !== index);
                                                                setSavedQueries(updatedQueries);
                                                                localStorage.setItem('savedQueries', JSON.stringify(updatedQueries));

                                                                toast.current.show({
                                                                    severity: 'info',
                                                                    summary: 'Requête supprimée',
                                                                    detail: `"${query.name}" a été supprimée`
                                                                });
                                                            }}
                                                        >
                                                            <i className="pi pi-trash me-1"></i> Supprimer
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <div className="d-flex justify-content-between w-100">
                                    <div className="d-flex gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-success btn-sm"
                                            onClick={exportQueries}
                                            disabled={savedQueries.length === 0}
                                        >
                                            <i className="pi pi-download me-1"></i>
                                            Exporter
                                        </button>
                                        <label className="btn btn-outline-info btn-sm mb-0">
                                            <i className="pi pi-upload me-1"></i>
                                            Importer
                                            <input
                                                type="file"
                                                accept=".json"
                                                onChange={importQueries}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                    </div>
                                    <div className="d-flex gap-2">
                                        <button type="button" className="btn btn-secondary" onClick={() => setShowLoadQueryDialog(false)}>
                                            Fermer
                                        </button>
                                        {savedQueries.length > 0 && (
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger"
                                                onClick={() => {
                                                    if (window.confirm('Voulez-vous vraiment supprimer toutes les requêtes sauvegardées ?')) {
                                                        setSavedQueries([]);
                                                        localStorage.removeItem('savedQueries');
                                                        setShowLoadQueryDialog(false);
                                                        toast.current.show({
                                                            severity: 'success',
                                                            summary: 'Toutes les requêtes supprimées',
                                                            detail: 'Le cache a été vidé'
                                                        });
                                                    }
                                                }}
                                            >
                                                <i className="pi pi-trash me-1"></i>
                                                Tout supprimer
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}