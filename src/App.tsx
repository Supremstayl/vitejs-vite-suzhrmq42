import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase Konfiguration mit sicherem Fallback
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vftpkzventrmmtlajl.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_JoQD_pjVmON8QDWm1tX5iA_47vtX0Qg';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function FahrzeugscheinScanner() {
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [apiKey, setApiKey] = useState(() => {
    return (
      localStorage.getItem('gemini_custom_api_key') ||
      'AQ.Ab8RN6KOnTDlIWUTg8lAPaiPHQElO5n-i4fKqoU3FummtTL9yw'
    );
  });

  const [scans, setScans] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Zwischenspeicher für KM-Stand bei neuen Scans
  const [pendingScanData, setPendingScanData] = useState(null);
  const [isKmModalOpen, setIsKmModalOpen] = useState(false);
  const [tempKmInput, setTempKmInput] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    kennzeichen: '',
    name: '',
    hersteller: '',
    modell: '',
    motorcode: '',
    kw: '',
    hubraum: '',
    hsn_tsn: '',
    baujahr: '',
    vin: '',
    schadstoffklasse: '',
    emissionsnummer: '',
    km_stand: '',
    tuev_datum: '',
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyForm, setHistoryForm] = useState({
    kategorie: 'Reparatur',
    datum: new Date().toISOString().split('T')[0],
    beschreibung: '',
    teilenummern: '',
    km_stand: '',
  });

  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [docForm, setDocForm] = useState({
    kategorie: 'Rechnungen',
    titel: '',
    datum: new Date().toISOString().split('T')[0],
    dateiData: '',
    isPdf: false,
  });

  const [duplicateModal, setDuplicateModal] = useState({
    isOpen: false,
    existingVehicle: null,
    newScanData: null,
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchVehiclesFromCloud();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchVehiclesFromCloud();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
    } catch (err) {
      alert('Login fehlgeschlagen: ' + err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setScans([]);
    setSelectedVehicle(null);
  };

  const fetchVehiclesFromCloud = async () => {
    try {
      const { data, error } = await supabase.from('vehicles').select('*');
      if (error) throw error;
      if (data) {
        const loadedScans = data.map((item) => ({
          supabaseId: item.id,
          ...item.data,
          bilder: item.data.bilder || (item.data.bild ? [item.data.bild] : []),
          historie: item.data.historie || [],
          dokumente: item.data.dokumente || [],
          km_stand: item.data.km_stand || 'Unbekannt',
          tuev_datum: item.data.tuev_datum || '',
          schadstoffklasse: item.data.schadstoffklasse || 'Nicht lesbar',
          emissionsnummer: item.data.emissionsnummer || 'Nicht lesbar',
        }));
        setScans(loadedScans);
      }
    } catch (err) {
      console.warn('Cloud-Laden fehlgeschlagen:', err.message);
    }
  };

  const saveVehicleToCloud = async (vehicleData) => {
    try {
      if (vehicleData.supabaseId) {
        const { error } = await supabase
          .from('vehicles')
          .update({ data: vehicleData })
          .eq('id', vehicleData.supabaseId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('vehicles')
          .insert([{ data: vehicleData }])
          .select();

        if (error) throw error;
        if (data && data[0]) {
          vehicleData.supabaseId = data[0].id;
        }
      }
    } catch (err) {
      console.warn('Cloud-Speichern fehlgeschlagen:', err.message);
    }
  };

  const deleteVehicleFromCloud = async (supabaseId) => {
    if (!supabaseId) return;
    try {
      await supabase.from('vehicles').delete().eq('id', supabaseId);
    } catch (err) {
      console.error('Fehler beim Löschen in der Cloud:', err.message);
    }
  };

  const handleSaveSettings = () => {
    if (!tempApiKey.trim()) {
      alert('Bitte gib einen gültigen API-Schlüssel ein.');
      return;
    }
    setApiKey(tempApiKey.trim());
    localStorage.setItem('gemini_custom_api_key', tempApiKey.trim());
    setIsSettingsOpen(false);
    alert('Einstellungen erfolgreich gespeichert!');
  };

  const startCamera = async () => {
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert('Fehler beim Kamerazugriff: ' + err.message);
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
    }
    setIsScanning(false);
  };

  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    stopCamera();

    if (selectedVehicle) {
      addPageToVehicle(imageBase64);
    } else {
      extractDataWithAI(imageBase64);
    }
  };

  const handleFileUpload = (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (index === 0 && !selectedVehicle) {
            extractDataWithAI(reader.result);
          } else if (selectedVehicle) {
            addPageToVehicle(reader.result);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const addPageToVehicle = async (imageBase64) => {
    const updatedBilder = [...(selectedVehicle.bilder || []), imageBase64];
    const updatedVehicle = { ...selectedVehicle, bilder: updatedBilder };

    setSelectedVehicle(updatedVehicle);
    setScans(
      scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
    );
    await saveVehicleToCloud(updatedVehicle);
  };

  const cancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setIsScanning(false);
  };

  const processNewVehicleData = async (newScanData) => {
    setPendingScanData(newScanData);
    setTempKmInput('');
    setIsKmModalOpen(true);
  };

  const handleKmModalSubmit = async (e) => {
    e.preventDefault();
    if (!tempKmInput.trim()) {
      alert('Der Kilometerstand ist zwingend erforderlich!');
      return;
    }

    const finalScanData = {
      ...pendingScanData,
      km_stand: tempKmInput.trim(),
    };

    setIsKmModalOpen(false);
    setPendingScanData(null);

    const existing = scans.find(
      (s) =>
        s.kennzeichen.toLowerCase() === finalScanData.kennzeichen.toLowerCase() &&
        finalScanData.kennzeichen !== 'Unbekannt' &&
        finalScanData.kennzeichen !== ''
    );

    if (existing) {
      setDuplicateModal({
        isOpen: true,
        existingVehicle: existing,
        newScanData: finalScanData,
      });
    } else {
      await saveVehicleToCloud(finalScanData);
      setScans((prevScans) => [finalScanData, ...prevScans]);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualForm.kennzeichen.trim()) {
      alert('Bitte gib mindestens ein Kennzeichen ein.');
      return;
    }
    if (!manualForm.km_stand.trim()) {
      alert('Der aktuelle Kilometerstand ist zwingend erforderlich!');
      return;
    }

    const newVehicle = {
      id: Date.now(),
      kennzeichen: manualForm.kennzeichen || 'Unbekannt',
      name: manualForm.name || 'Unbekannt',
      hersteller: manualForm.hersteller || 'Unbekannt',
      modell: manualForm.modell || 'Unbekannt',
      baujahr: manualForm.baujahr || 'Nicht lesbar',
      hsn_tsn: manualForm.hsn_tsn || 'Nicht lesbar',
      vin: manualForm.vin || 'Nicht lesbar',
      schadstoffklasse: manualForm.schadstoffklasse || 'Nicht lesbar',
      emissionsnummer: manualForm.emissionsnummer || 'Nicht lesbar',
      hubraum: manualForm.hubraum || 'Nicht lesbar',
      kw: manualForm.kw || 'Nicht lesbar',
      motorcode: manualForm.motorcode || 'Nicht eingetragen',
      km_stand: manualForm.km_stand,
      tuev_datum: manualForm.tuev_datum || '',
      bilder: [],
      historie: [],
      dokumente: [],
      datum: new Date().toLocaleDateString('de-DE'),
    };

    const existing = scans.find(
      (s) =>
        s.kennzeichen.toLowerCase() === newVehicle.kennzeichen.toLowerCase() &&
        newVehicle.kennzeichen !== 'Unbekannt' &&
        newVehicle.kennzeichen !== ''
    );

    if (existing) {
      setIsManualOpen(false);
      setDuplicateModal({
        isOpen: true,
        existingVehicle: existing,
        newScanData: newVehicle,
      });
    } else {
      await saveVehicleToCloud(newVehicle);
      setScans((prevScans) => [newVehicle, ...prevScans]);
      setIsManualOpen(false);
      setManualForm({
        kennzeichen: '',
        name: '',
        hersteller: '',
        modell: '',
        motorcode: '',
        kw: '',
        hubraum: '',
        hsn_tsn: '',
        baujahr: '',
        vin: '',
        schadstoffklasse: '',
        emissionsnummer: '',
        km_stand: '',
        tuev_datum: '',
      });
    }
  };

  const extractDataWithAI = async (imageBase64) => {
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    const base64Data = imageBase64.split(',')[1];

    const prompt = `Du bist ein Experte für Fahrzeugdokumente. Analysiere diesen deutschen Fahrzeugschein (Zulassungsbescheinigung Teil I oder alter Fahrzeugschein).
    Extrahiere die folgenden Daten und gib sie AUSSCHLIESSLICH als valides JSON-Objekt zurück. Keine Erklärungen, kein Markdown drumherum.
    Nutze exakt diese JSON-Keys:
    - kennzeichen (Amtliches Kennzeichen, formatiert als XX-XX 0000)
    - name (Name des Halters)
    - hersteller (Fahrzeughersteller, D.1 oder Feld 2)
    - modell (Fahrzeugmodell, D.3 oder Feld 3)
    - baujahr (Datum der Erstzulassung, Feld B oder Feld 32)
    - hsn_tsn (Die HSN und TSN zusammen, Feld 2.1 und 2.2, zum Beispiel null-null-null-fuenf/ABC)
    - vin (Fahrgestellnummer, Feld E oder Feld 4)
    - schadstoffklasse (Feld 14 oder Feld 1)
    - emissionsnummer (Feld 14.1 oder die letzten 2 Ziffern von Feld 1)
    - hubraum (Feld P.1 oder Feld 8, Wert in ccm)
    - kw (Feld P.2 oder Feld 7, exakter Wert in kW, ohne PS, z.B. 129 kW)
    Falls ein Wert nicht auf dem Bild erkennbar ist, schreibe "Nicht lesbar".`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: { mime_type: 'image/jpeg', data: base64Data },
                  },
                ],
              },
            ],
          }),
        }
      );

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error.message);
      }

      let textResponse = result.candidates[0].content.parts[0].text;
      textResponse = textResponse
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const aiData = JSON.parse(textResponse);

      const newScanData = {
        id: Date.now(),
        kennzeichen: aiData.kennzeichen || 'Unbekannt',
        name: aiData.name || 'Unbekannt',
        hersteller: aiData.hersteller || 'Unbekannt',
        modell: aiData.modell || 'Unbekannt',
        baujahr: aiData.baujahr || 'Unbekannt',
        hsn_tsn: aiData.hsn_tsn || 'Unbekannt',
        vin: aiData.vin || 'Unbekannt',
        schadstoffklasse: aiData.schadstoffklasse || 'Nicht lesbar',
        emissionsnummer: aiData.emissionsnummer || 'Nicht lesbar',
        hubraum: aiData.hubraum || 'Unbekannt',
        kw: aiData.kw || 'Unbekannt',
        motorcode: 'Nicht eingetragen',
        tuev_datum: '',
        bilder: [imageBase64],
        historie: [],
        dokumente: [],
        datum: new Date().toLocaleDateString('de-DE'),
      };

      await processNewVehicleData(newScanData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        alert('Fehler bei der KI-Analyse: ' + err.message);
      }
    } finally {
      setIsLoading(false);
      setIsScanning(false);
    }
  };

  const handleDuplicateAction = async (action) => {
    const { existingVehicle, newScanData } = duplicateModal;

    if (action === 'new') {
      await saveVehicleToCloud(newScanData);
      setScans((prev) => [newScanData, ...prev]);
    } else if (action === 'merge') {
      const updatedBilder = [
        ...(existingVehicle.bilder || []),
        ...(newScanData.bilder || []),
      ];
      const merged = { ...existingVehicle, bilder: updatedBilder };
      await saveVehicleToCloud(merged);
      setScans((prev) =>
        prev.map((s) => (s.id === existingVehicle.id ? merged : s))
      );
      setSelectedVehicle(merged);
    } else if (action === 'overwrite') {
      const overwritten = {
        ...existingVehicle,
        ...newScanData,
        id: existingVehicle.id,
        supabaseId: existingVehicle.supabaseId,
        km_stand: newScanData.km_stand || existingVehicle.km_stand,
        bilder:
          newScanData.bilder.length > 0
            ? newScanData.bilder
            : existingVehicle.bilder,
        historie: existingVehicle.historie,
        dokumente: existingVehicle.dokumente,
      };
      await saveVehicleToCloud(overwritten);
      setScans((prev) =>
        prev.map((s) => (s.id === existingVehicle.id ? overwritten : s))
      );
      setSelectedVehicle(overwritten);
    }

    setDuplicateModal({
      isOpen: false,
      existingVehicle: null,
      newScanData: null,
    });
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (
      window.confirm(
        '⚠️ Möchtest du diesen Fahrzeugschein wirklich unwiderruflich löschen?'
      )
    ) {
      const scanToDelete = scans.find((s) => s.id === id);
      if (scanToDelete && scanToDelete.supabaseId) {
        await deleteVehicleFromCloud(scanToDelete.supabaseId);
      }
      const updatedScans = scans.filter((scan) => scan.id !== id);
      setScans(updatedScans);
      if (selectedVehicle && selectedVehicle.id === id) {
        setSelectedVehicle(null);
        setIsEditing(false);
      }
    }
  };

  const handleDeletePage = async (e, indexToRemove) => {
    e.stopPropagation();
    if (selectedVehicle.bilder.length <= 1) {
      alert(
        'Ein Fahrzeugschein muss mindestens eine Seite haben. Nutze ansonsten die Gesamtlöschung.'
      );
      return;
    }
    if (window.confirm('Diese Seite wirklich löschen?')) {
      const updatedBilder = selectedVehicle.bilder.filter(
        (_, idx) => idx !== indexToRemove
      );
      const updatedVehicle = { ...selectedVehicle, bilder: updatedBilder };
      setSelectedVehicle(updatedVehicle);
      setScans(
        scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
      );
      await saveVehicleToCloud(updatedVehicle);
    }
  };

  const handleStartEdit = (e, scan) => {
    e.stopPropagation();
    setSelectedVehicle(scan);
    setEditForm({
      ...scan,
      motorcode: scan.motorcode || 'Nicht eingetragen',
      km_stand: scan.km_stand || '',
      tuev_datum: scan.tuev_datum || '',
      schadstoffklasse: scan.schadstoffklasse || '',
      emissionsnummer: scan.emissionsnummer || '',
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    const updatedScans = scans.map((scan) =>
      scan.id === editForm.id ? editForm : scan
    );
    setScans(updatedScans);
    setSelectedVehicle(editForm);
    setIsEditing(false);
    await saveVehicleToCloud(editForm);
  };

  const handleAddHistoryEntry = async (e) => {
    e.preventDefault();
    if (!historyForm.beschreibung.trim()) {
      alert('Bitte gib eine Beschreibung der Arbeiten ein.');
      return;
    }
    if (!historyForm.km_stand.trim()) {
      alert('Der Kilometerstand ist für jeden Historien-Eintrag zwingend erforderlich!');
      return;
    }

    const newEntry = {
      id: Date.now(),
      ...historyForm,
    };

    const updatedHistorie = [newEntry, ...(selectedVehicle.historie || [])];
    const updatedVehicle = {
      ...selectedVehicle,
      km_stand: historyForm.km_stand,
      historie: updatedHistorie,
    };

    setSelectedVehicle(updatedVehicle);
    setScans(
      scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
    );
    await saveVehicleToCloud(updatedVehicle);

    setHistoryForm({
      kategorie: 'Reparatur',
      datum: new Date().toISOString().split('T')[0],
      beschreibung: '',
      teilenummern: '',
      km_stand: '',
    });
  };

  const handleDeleteHistoryEntry = async (entryId) => {
    if (window.confirm('Diesen Historien-Eintrag wirklich löschen?')) {
      const updatedHistorie = selectedVehicle.historie.filter(
        (h) => h.id !== entryId
      );
      const updatedVehicle = { ...selectedVehicle, historie: updatedHistorie };

      setSelectedVehicle(updatedVehicle);
      setScans(
        scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
      );
      await saveVehicleToCloud(updatedVehicle);
    }
  };

  const handleAddDocument = async (e) => {
    e.preventDefault();
    if (!docForm.titel.trim()) {
      alert('Bitte gib einen Titel für das Dokument an.');
      return;
    }

    const newDoc = {
      id: Date.now(),
      ...docForm,
    };

    const updatedDocs = [newDoc, ...(selectedVehicle.dokumente || [])];
    const updatedVehicle = { ...selectedVehicle, dokumente: updatedDocs };

    setSelectedVehicle(updatedVehicle);
    setScans(
      scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
    );
    await saveVehicleToCloud(updatedVehicle);

    setDocForm({
      kategorie: 'Rechnungen',
      titel: '',
      datum: new Date().toISOString().split('T')[0],
      dateiData: '',
      isPdf: false,
    });
  };

  const handleDeleteDocument = async (docId) => {
    if (window.confirm('Dieses Dokument wirklich löschen?')) {
      const updatedDocs = selectedVehicle.dokumente.filter(
        (d) => d.id !== docId
      );
      const updatedVehicle = { ...selectedVehicle, dokumente: updatedDocs };

      setSelectedVehicle(updatedVehicle);
      setScans(
        scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
      );
      await saveVehicleToCloud(updatedVehicle);
    }
  };

  const handleDocFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const isPdf =
        file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const reader = new FileReader();
      reader.onloadend = () => {
        setDocForm({
          ...docForm,
          dateiData: reader.result,
          isPdf: isPdf,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const openDocumentInNewTab = (doc) => {
    if (!doc.dateiData) return;

    if (doc.isPdf) {
      const byteCharacters = atob(doc.dateiData.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } else {
      const win = window.open();
      win.document.write(
        `<iframe src="${doc.dateiData}" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`
      );
    }
  };

  // PDF-Bericht / Druckfunktion
  const printVehicleReport = () => {
    if (!selectedVehicle) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Fahrzeugbericht - ${selectedVehicle.kennzeichen}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
            h1 { color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 5px; }
            h2 { color: #475569; margin-top: 20px; border-bottom: 1px solid #cbd5e1; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .card { background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f1f5f9; }
          </style>
        </head>
        <body>
          <h1>Fahrzeugakte: ${selectedVehicle.kennzeichen}</h1>
          <div class="grid">
            <div class="card">
              <p><b>Halter / Kunde:</b> ${selectedVehicle.name}</p>
              <p><b>Fahrzeug:</b> ${selectedVehicle.hersteller} ${selectedVehicle.modell}</p>
              <p><b>Motorcode:</b> ${selectedVehicle.motorcode || 'Nicht eingetragen'}</p>
              <p><b>Kilometerstand:</b> ${selectedVehicle.km_stand} km</p>
              <p><b>Schadstoffklasse:</b> ${selectedVehicle.schadstoffklasse}</p>
            </div>
            <div class="card">
              <p><b>Leistung / Hubraum:</b> ${selectedVehicle.kw} / ${selectedVehicle.hubraum}</p>
              <p><b>HSN / TSN:</b> ${selectedVehicle.hsn_tsn}</p>
              <p><b>FIN (VIN):</b> ${selectedVehicle.vin}</p>
              <p><b>Emissionsnummer:</b> ${selectedVehicle.emissionsnummer}</p>
              <p><b>Nächste HU/TÜV:</b> ${selectedVehicle.tuev_datum || 'Nicht hinterlegt'}</p>
            </div>
          </div>

          <h2>Werkstatt-Historie (${selectedVehicle.historie?.length || 0} Einträge)</h2>
          <table>
            <tr><th>Datum</th><th>Kategorie</th><th>KM-Stand</th><th>Beschreibung & Teile</th></tr>
            ${selectedVehicle.historie && selectedVehicle.historie.length > 0 ? selectedVehicle.historie.map(h => `
              <tr>
                <td>${h.datum}</td>
                <td><b>${h.kategorie}</b></td>
                <td>${h.km_stand} km</td>
                <td>${h.beschreibung} ${h.teilenummern ? `<br><i>Teile: ${h.teilenummern}</i>` : ''}</td>
              </tr>
            `).join('') : '<tr><td colspan="4">Keine Historien-Einträge vorhanden.</td></tr>'}
          </table>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // TÜV-Countdown Berechnung
  const getTuevStatus = (tuevStr) => {
    if (!tuevStr) return { text: 'TÜV nicht hinterlegt', color: 'bg-gray-800 text-gray-400 border-gray-700' };
    const tuevDate = new Date(tuevStr);
    const today = new Date();
    const diffTime = tuevDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `TÜV überfällig seit ${Math.abs(diffDays)} Tagen!`, color: 'bg-red-950/80 text-red-300 border-red-700 animate-pulse' };
    } else if (diffDays <= 30) {
      return { text: `TÜV fällig in ${diffDays} Tagen!`, color: 'bg-amber-950/80 text-amber-300 border-amber-700' };
    } else {
      return { text: `TÜV gültig bis ${tuevStr}`, color: 'bg-green-950/60 text-green-300 border-green-800' };
    }
  };

  if (!session) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-gray-900 text-gray-100 font-sans w-full h-full flex justify-center items-center p-4">
        <div className="max-w-sm w-full bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="text-center">
            <div className="text-3xl mb-1">🔐</div>
            <h2 className="text-xl font-bold text-white">Cloud Login</h2>
            <p className="text-xs text-gray-400 mt-1">
              Bitte melde dich mit deinen Zugangsdaten an, um fortzufahren.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">E-Mail-Adresse:</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="name@beispiel.de"
                className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Passwort:</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-xs shadow transition-all mt-2"
            >
              {authLoading ? 'Anmeldung läuft...' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filteredScans = scans.filter((scan) => {
    const term = searchTerm.toLowerCase();
    const matchBase =
      scan.kennzeichen.toLowerCase().includes(term) ||
      scan.name.toLowerCase().includes(term) ||
      scan.hersteller.toLowerCase().includes(term) ||
      scan.vin.toLowerCase().includes(term) ||
      (scan.motorcode && scan.motorcode.toLowerCase().includes(term));

    const matchHistory =
      scan.historie &&
      scan.historie.some(
        (h) =>
          h.beschreibung.toLowerCase().includes(term) ||
          (h.teilenummern && h.teilenummern.toLowerCase().includes(term))
      );

    return matchBase || matchHistory;
  });

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-900 text-gray-100 font-sans w-full h-full flex justify-center">
      <div className="max-w-md w-full bg-gray-900 h-full flex flex-col shadow-2xl border-x border-gray-800">
        <header className="bg-gray-800 text-white p-4 shadow-md flex justify-between items-center border-b border-gray-700 sticky top-0 z-10 shrink-0">
          <div>
            <h1 className="text-xl font-bold tracking-wide text-white">
              KFZ-Schein Scanner
            </h1>
            <span className="text-[10px] text-gray-400 block">Eingeloggt: {session.user.email}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setTempApiKey(apiKey);
                setIsSettingsOpen(true);
              }}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xl transition-all shadow border border-gray-600 flex items-center justify-center text-xs"
              title="Einstellungen"
            >
              ⚙️
            </button>
            <button
              onClick={handleLogout}
              className="p-2 bg-red-900/60 hover:bg-red-700 text-red-200 rounded-xl transition-all shadow border border-red-700 flex items-center justify-center text-xs"
              title="Abmelden"
            >
              🚪
            </button>
          </div>
        </header>

        <main className="p-4 overflow-y-auto flex-grow pb-16">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-400 relative">
              <button
                onClick={cancelAnalysis}
                className="absolute top-4 right-4 bg-gray-800 hover:bg-red-600 text-gray-300 hover:text-white font-bold w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center shadow-lg transition-all"
                title="Analyse abbrechen"
              >
                ✕
              </button>

              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-400 mb-4"></div>
              <p className="font-bold text-lg mb-2">
                Analysiere den Fahrzeugschein...
              </p>
              <p className="text-xs text-gray-500">
                Tippe auf das X, um abzubrechen
              </p>
            </div>
          ) : selectedVehicle ? (
            <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <button
                  onClick={() => {
                    setSelectedVehicle(null);
                    setIsEditing(false);
                  }}
                  className="text-blue-400 hover:text-blue-300 transition-colors font-bold flex items-center text-xs"
                >
                  ← Zurück zur Übersicht
                </button>

                {!isEditing && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={printVehicleReport}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] px-2 py-1.5 rounded-lg font-bold transition-all shadow flex items-center gap-1"
                      title="PDF-Bericht drucken"
                    >
                      🖨️ PDF
                    </button>
                    <button
                      onClick={() => setIsHistoryOpen(true)}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-[11px] px-2 py-1.5 rounded-lg font-bold transition-all shadow flex items-center gap-1"
                      title="Werkstatt-Historie"
                    >
                      📋 ({selectedVehicle.historie?.length || 0})
                    </button>
                    <button
                      onClick={() => setIsDocsOpen(true)}
                      className="bg-teal-600 hover:bg-teal-700 text-white text-[11px] px-2 py-1.5 rounded-lg font-bold transition-all shadow flex items-center gap-1"
                      title="Dokumente"
                    >
                      📎 ({selectedVehicle.dokumente?.length || 0})
                    </button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white mb-2">
                    Fahrzeugdaten bearbeiten
                  </h2>

                  <div>
                    <label className="text-xs text-gray-400">Kennzeichen:</label>
                    <input
                      type="text"
                      value={editForm.kennzeichen || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, kennzeichen: e.target.value })
                      }
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-400">Kunde / Halter:</label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Hersteller:</label>
                      <input
                        type="text"
                        value={editForm.hersteller || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, hersteller: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Modell:</label>
                      <input
                        type="text"
                        value={editForm.modell || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, modell: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Motorcode:</label>
                      <input
                        type="text"
                        value={editForm.motorcode || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, motorcode: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-blue-500 rounded text-white text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-red-400 font-bold">KM-Stand *:</label>
                      <input
                        type="text"
                        required
                        value={editForm.km_stand || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, km_stand: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-red-500 rounded text-white text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Schadstoffklasse:</label>
                      <input
                        type="text"
                        value={editForm.schadstoffklasse || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, schadstoffklasse: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Emissionsnummer:</label>
                      <input
                        type="text"
                        value={editForm.emissionsnummer || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, emissionsnummer: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400">Nächste HU / TÜV (Datum):</label>
                    <input
                      type="date"
                      value={editForm.tuev_datum || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, tuev_datum: e.target.value })
                      }
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold shadow transition-all"
                    >
                      💾 Speichern
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-bold shadow transition-all"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white tracking-wide">
                      {selectedVehicle.kennzeichen}
                    </h2>
                    <button
                      onClick={(e) => handleStartEdit(e, selectedVehicle)}
                      className="p-1.5 bg-gray-700 hover:bg-blue-600 text-gray-200 hover:text-white rounded-md transition-all shadow border border-gray-600 flex items-center justify-center text-xs"
                      title="Fahrzeugdaten bearbeiten"
                    >
                      ✏️ Bearbeiten
                    </button>
                  </div>

                  {/* TÜV Status Banner */}
                  <div className={`p-2.5 rounded-lg border text-xs font-semibold mb-4 flex items-center justify-between ${getTuevStatus(selectedVehicle.tuev_datum).color}`}>
                    <span>🛡️ {getTuevStatus(selectedVehicle.tuev_datum).text}</span>
                    <span className="font-mono">{selectedVehicle.tuev_datum ? `(${selectedVehicle.tuev_datum})` : ''}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6 text-xs">
                    <div>
                      <span className="text-gray-400">Kunde:</span>
                      <br />
                      <b className="text-gray-100 text-sm">{selectedVehicle.name}</b>
                    </div>
                    <div>
                      <span className="text-gray-400">Fahrzeug:</span>
                      <br />
                      <b className="text-gray-100 text-sm">
                        {selectedVehicle.hersteller} {selectedVehicle.modell}
                      </b>
                    </div>
                    <div className="bg-gray-900/60 p-2 rounded-lg border border-gray-700">
                      <span className="text-gray-400 text-[10px] uppercase">Motorcode:</span>
                      <br />
                      <b className="text-blue-400 text-sm">{selectedVehicle.motorcode || 'Keiner'}</b>
                    </div>
                    <div className="bg-gray-900/60 p-2 rounded-lg border border-gray-700">
                      <span className="text-gray-400 text-[10px] uppercase">Kilometerstand:</span>
                      <br />
                      <b className="text-emerald-400 text-sm">{selectedVehicle.km_stand} km</b>
                    </div>
                    <div>
                      <span className="text-gray-400">Leistung:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.kw}</b>
                    </div>
                    <div>
                      <span className="text-gray-400">Hubraum:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.hubraum}</b>
                    </div>
                    <div>
                      <span className="text-gray-400">Schadstoffklasse:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.schadstoffklasse}</b>
                    </div>
                    <div>
                      <span className="text-gray-400">Emissionsnummer:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.emissionsnummer}</b>
                    </div>
                    <div>
                      <span className="text-gray-400">HSN/TSN:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.hsn_tsn}</b>
                    </div>
                    <div>
                      <span className="text-gray-400">Baujahr / EZ:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.baujahr}</b>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400">Fahrgestellnummer (VIN):</span>
                      <br />
                      <b className="text-gray-100 font-mono text-[11px]">{selectedVehicle.vin}</b>
                    </div>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
                        Gescannte Seiten ({selectedVehicle.bilder?.length || 0}):
                      </h3>
                    </div>

                    <div className="flex flex-row gap-2 mb-4">
                      <button
                        onClick={startCamera}
                        className="w-1/2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-2 rounded-xl font-bold text-xs shadow flex justify-center items-center gap-1 transition-all"
                      >
                        📷 Kamera Seite
                      </button>

                      <label className="w-1/2 bg-gray-700 hover:bg-gray-600 text-gray-200 hover:text-white py-2 px-2 rounded-xl font-bold text-xs shadow flex justify-center items-center gap-1 cursor-pointer transition-all border border-gray-600 text-center">
                        📁 Datei wählen
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="space-y-3">
                      {selectedVehicle.bilder &&
                        selectedVehicle.bilder.map((imgSrc, idx) => (
                          <div
                            key={idx}
                            className="relative bg-gray-900 p-2 rounded-lg border border-gray-700"
                          >
                            <div className="flex justify-between items-center mb-1 px-1">
                              <span className="text-xs text-gray-400 font-semibold">
                                Seite {idx + 1}
                              </span>
                              <div className="flex gap-2.5 items-center">
                                <button
                                  onClick={() => {
                                    setActiveImageIndex(idx);
                                    setIsModalOpen(true);
                                  }}
                                  className="text-xs text-blue-400 hover:underline"
                                >
                                  🔍 Vergrößern
                                </button>
                                <button
                                  onClick={(e) => handleDeletePage(e, idx)}
                                  className="text-xs text-red-400 hover:underline font-bold"
                                  title="Diese Seite löschen"
                                >
                                  🗑️ Löschen
                                </button>
                              </div>
                            </div>
                            <img
                              src={imgSrc}
                              alt={`Fahrzeugschein Seite ${idx + 1}`}
                              onClick={() => {
                                setActiveImageIndex(idx);
                                setIsModalOpen(true);
                              }}
                              className="w-full rounded border border-gray-600 cursor-pointer hover:border-blue-500 transition-all object-cover max-h-48"
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : isScanning ? (
            <div className="bg-black rounded-xl overflow-hidden relative shadow-lg border border-gray-700">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-96 object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                <button
                  onClick={stopCamera}
                  className="bg-red-600 hover:bg-red-700 transition-colors text-white px-5 py-2 rounded-full font-bold shadow-lg text-xs"
                >
                  Abbrechen
                </button>
                <button
                  onClick={captureImage}
                  className="bg-white text-blue-600 px-6 py-2 rounded-full font-bold shadow-lg text-xs"
                >
                  {selectedVehicle ? 'Seite hinzufügen' : 'Foto auslösen'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-6">
                <button
                  onClick={startCamera}
                  className="bg-blue-600 text-white py-3 px-1 rounded-xl font-bold text-xs shadow-lg flex flex-col justify-center items-center gap-1 hover:bg-blue-700 transition-all active:scale-95 text-center"
                >
                  <span>📷</span> Kamera
                </button>

                <label className="bg-gray-800 text-gray-200 py-3 px-1 rounded-xl font-bold text-xs shadow-lg flex flex-col justify-center items-center gap-1 cursor-pointer hover:bg-gray-700 hover:text-white transition-all border border-gray-600 active:scale-95 text-center">
                  <span>📁</span> Datei
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => setIsManualOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white py-3 px-1 rounded-xl font-bold text-xs shadow-lg flex flex-col justify-center items-center gap-1 transition-all active:scale-95 text-center"
                >
                  <span>➕</span> Manuell
                </button>
              </div>

              <div className="mb-6 relative">
                <input
                  type="text"
                  placeholder="🔍 Suche (Kennzeichen, Name, Teilenummer...)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full p-3 pl-10 bg-gray-800 text-white border border-gray-700 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 text-xs transition-all"
                />
              </div>

              <div className="space-y-3">
                {filteredScans.map((scan) => (
                  <div
                    key={scan.id}
                    onClick={() => setSelectedVehicle(scan)}
                    className="bg-gray-800 p-3.5 rounded-xl shadow-md cursor-pointer border-l-4 border-blue-500 hover:bg-gray-700 hover:shadow-lg transition-all flex justify-between items-center"
                  >
                    <div className="flex-grow pr-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-base text-white">
                          {scan.kennzeichen}
                        </span>
                        <span className="text-[11px] bg-emerald-950/60 text-emerald-400 px-2 py-0.5 rounded font-mono border border-emerald-800">
                          {scan.km_stand} km
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 flex flex-wrap items-center gap-2">
                        <span className="text-gray-300">
                          {scan.hersteller} {scan.modell}
                        </span>
                        <span>|</span>
                        <span className="text-blue-400 font-medium">
                          {scan.motorcode || 'Kein Motorcode'}
                        </span>
                        {scan.historie && scan.historie.length > 0 && (
                          <span className="text-[10px] bg-purple-950/60 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800">
                            📋 {scan.historie.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={(e) => handleStartEdit(e, scan)}
                        title="Bearbeiten"
                        className="p-1.5 bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white rounded-lg transition-colors text-xs"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, scan.id)}
                        title="Löschen"
                        className="p-1.5 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white rounded-lg transition-colors text-xs"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                {filteredScans.length === 0 && (
                  <p className="text-center text-gray-500 text-xs mt-8">
                    Keine Fahrzeuge gefunden.
                  </p>
                )}
              </div>
            </>
          )}
        </main>

        <footer className="bg-gray-900 border-t border-gray-800 text-right p-3 sticky bottom-0 z-10 shrink-0">
          <p className="text-xs text-gray-500">© D.Irmer</p>
        </footer>

        {/* Pflichtfeld KM-Stand Modal nach Scan oder Datei-Upload */}
        {isKmModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-800 border border-red-500/50 rounded-2xl p-5 max-w-xs w-full shadow-2xl space-y-4 text-center">
              <div className="text-3xl mb-1">🚗</div>
              <h2 className="text-lg font-bold text-white">Kilometerstand erforderlich</h2>
              <p className="text-xs text-gray-300">
                Bitte gib den aktuellen Kilometerstand für das Kennzeichen <b className="text-blue-400">{pendingScanData?.kennzeichen}</b> ein:
              </p>

              <form onSubmit={handleKmModalSubmit} className="space-y-3">
                <input
                  type="text"
                  required
                  autoFocus
                  value={tempKmInput}
                  onChange={(e) => setTempKmInput(e.target.value)}
                  placeholder="z.B. 145200"
                  className="w-full p-3 bg-gray-900 border border-red-500 rounded-xl text-white font-mono text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs shadow transition-all"
                >
                  ✓ Speichern & Weiter
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Manuell Anlegen Modal */}
        {isManualOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-gray-700 pb-2">
                <h2 className="text-base font-bold text-white">
                  ➕ Fahrzeug manuell anlegen
                </h2>
                <button
                  onClick={() => setIsManualOpen(false)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-2.5 text-xs">
                <div>
                  <label className="text-gray-400">Kennzeichen *:</label>
                  <input
                    type="text"
                    required
                    value={manualForm.kennzeichen}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, kennzeichen: e.target.value })
                    }
                    placeholder="z.B. ES-DI 2026"
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-red-400 font-bold">KM-Stand *:</label>
                    <input
                      type="text"
                      required
                      value={manualForm.km_stand}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, km_stand: e.target.value })
                      }
                      placeholder="z.B. 125000"
                      className="w-full p-2 bg-gray-900 border border-red-500 rounded-lg text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Nächste HU / TÜV:</label>
                    <input
                      type="date"
                      value={manualForm.tuev_datum}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, tuev_datum: e.target.value })
                      }
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-400">Kunde / Halter:</label>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, name: e.target.value })
                    }
                    placeholder="z.B. Daniel Irmer"
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400">Hersteller:</label>
                    <input
                      type="text"
                      value={manualForm.hersteller}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, hersteller: e.target.value })
                      }
                      placeholder="z.B. BMW"
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Modell:</label>
                    <input
                      type="text"
                      value={manualForm.modell}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, modell: e.target.value })
                      }
                      placeholder="z.B. 320i"
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-400">Motorcode:</label>
                  <input
                    type="text"
                    value={manualForm.motorcode}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, motorcode: e.target.value })
                    }
                    placeholder="z.B. N20B20"
                    className="w-full p-2 bg-gray-900 border border-blue-500 rounded-lg text-white font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400">Leistung (kW):</label>
                    <input
                      type="text"
                      value={manualForm.kw}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, kw: e.target.value })
                      }
                      placeholder="z.B. 135 kW"
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Hubraum (ccm):</label>
                    <input
                      type="text"
                      value={manualForm.hubraum}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, hubraum: e.target.value })
                      }
                      placeholder="z.B. 1997"
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400">Schadstoffklasse:</label>
                    <input
                      type="text"
                      value={manualForm.schadstoffklasse}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, schadstoffklasse: e.target.value })
                      }
                      placeholder="z.B. Euro 6"
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Emissionsnummer:</label>
                    <input
                      type="text"
                      value={manualForm.emissionsnummer}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, emissionsnummer: e.target.value })
                      }
                      placeholder="z.B. 36AG"
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400">HSN/TSN:</label>
                    <input
                      type="text"
                      value={manualForm.hsn_tsn}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, hsn_tsn: e.target.value })
                      }
                      placeholder="z.B. 0005/ABC"
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400">Baujahr / EZ:</label>
                    <input
                      type="text"
                      value={manualForm.baujahr}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, baujahr: e.target.value })
                      }
                      placeholder="z.B. 05.2014"
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-400">Fahrgestellnummer (VIN):</label>
                  <input
                    type="text"
                    value={manualForm.vin}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, vin: e.target.value })
                    }
                    placeholder="z.B. WBA3A57..."
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-bold shadow transition-all"
                  >
                    💾 Anlegen
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsManualOpen(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-bold shadow transition-all"
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {duplicateModal.isOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-800 border border-yellow-600/50 rounded-2xl p-5 max-w-xs w-full shadow-2xl space-y-3 text-center">
              <div className="text-3xl mb-1">⚠️</div>
              <h2 className="text-base font-bold text-white">Fahrzeug vorhanden!</h2>
              <p className="text-xs text-gray-300">
                Das Kennzeichen <b className="text-blue-400">{duplicateModal.newScanData?.kennzeichen}</b> ist bereits gespeichert.
              </p>

              <div className="space-y-2 pt-1 text-xs">
                <button
                  onClick={() => handleDuplicateAction('merge')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-xl font-bold shadow"
                >
                  📁 Seiten anhängen
                </button>
                <button
                  onClick={() => handleDuplicateAction('overwrite')}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 px-3 rounded-xl font-bold shadow"
                >
                  🔄 Stammdaten überschreiben
                </button>
                <button
                  onClick={() => handleDuplicateAction('new')}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-3 rounded-xl font-bold shadow"
                >
                  ➕ Als neues Fahrzeug anlegen
                </button>
              </div>
            </div>
          </div>
        )}

        {isSettingsOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setIsSettingsOpen(false)}
          >
            <div
              className="bg-gray-800 border border-gray-700 rounded-2xl p-5 max-w-xs w-full shadow-2xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-white">⚙️ Einstellungen</h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-1"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="text-xs text-gray-300 font-semibold mb-1 block">
                  Gemini API Key:
                </label>
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="API Key..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveSettings}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl font-bold text-xs shadow"
                >
                  Speichern
                </button>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-xl font-bold text-xs shadow"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}

        {isHistoryOpen && selectedVehicle && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setIsHistoryOpen(false)}
          >
            <div
              className="bg-gray-800 border border-gray-700 rounded-2xl p-4 max-w-md w-full shadow-2xl space-y-3 max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-gray-700 pb-2 shrink-0">
                <div>
                  <h2 className="text-base font-bold text-white">📋 Werkstatt-Historie</h2>
                  <p className="text-[11px] text-gray-400">{selectedVehicle.kennzeichen}</p>
                </div>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-1 text-base"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={handleAddHistoryEntry}
                className="bg-gray-900 p-2.5 rounded-xl border border-gray-700 space-y-2.5 shrink-0 text-xs"
              >
                <h3 className="font-bold text-blue-400 uppercase tracking-wider text-[11px]">
                  Neuen Eintrag erfassen
                </h3>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">Kategorie:</label>
                    <select
                      value={historyForm.kategorie}
                      onChange={(e) =>
                        setHistoryForm({ ...historyForm, kategorie: e.target.value })
                      }
                      className="w-full p-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                    >
                      <option value="Reparatur">Reparatur</option>
                      <option value="Kundendienst">Kundendienst</option>
                      <option value="Fehlersuche">Fehlersuche</option>
                      <option value="TÜV / AU">TÜV / AU</option>
                      <option value="Sonstiges">Sonstiges</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-red-400 font-bold">KM-Stand *:</label>
                    <input
                      type="text"
                      required
                      value={historyForm.km_stand}
                      onChange={(e) =>
                        setHistoryForm({ ...historyForm, km_stand: e.target.value })
                      }
                      placeholder="z.B. 146000"
                      className="w-full p-1.5 bg-gray-800 border border-red-500 rounded text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Datum:</label>
                    <input
                      type="date"
                      value={historyForm.datum}
                      onChange={(e) =>
                        setHistoryForm({ ...historyForm, datum: e.target.value })
                      }
                      className="w-full p-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-400">Beschreibung / Diagnose:</label>
                  <textarea
                    rows="2"
                    value={historyForm.beschreibung}
                    onChange={(e) =>
                      setHistoryForm({ ...historyForm, beschreibung: e.target.value })
                    }
                    placeholder="z.B. Bremsscheiben und Beläge erneuert..."
                    className="w-full p-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-400">Teilenummern (optional):</label>
                  <input
                    type="text"
                    value={historyForm.teilenummern}
                    onChange={(e) =>
                      setHistoryForm({ ...historyForm, teilenummern: e.target.value })
                    }
                    placeholder="z.B. 34116855007, ATE-24.0122..."
                    className="w-full p-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-bold text-xs shadow"
                >
                  + Zur Historie hinzufügen
                </button>
              </form>

              <div className="overflow-y-auto flex-grow space-y-2 pr-1 text-xs">
                <h3 className="font-bold text-gray-400 uppercase tracking-wider text-[11px] mb-1">
                  Bisherige Einträge ({selectedVehicle.historie?.length || 0}):
                </h3>

                {selectedVehicle.historie && selectedVehicle.historie.length > 0 ? (
                  selectedVehicle.historie.map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-gray-900 p-2.5 rounded-xl border border-gray-700 relative"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              entry.kategorie === 'Reparatur'
                                ? 'bg-red-950 text-red-300 border border-red-800'
                                : entry.kategorie === 'Kundendienst'
                                ? 'bg-green-950 text-green-300 border border-green-800'
                                : 'bg-blue-950 text-blue-300 border border-blue-800'
                            }`}
                          >
                            {entry.kategorie}
                          </span>
                          <span className="text-[11px] text-emerald-400 font-mono font-bold">
                            {entry.km_stand} km
                          </span>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {entry.datum}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteHistoryEntry(entry.id)}
                          className="text-gray-500 hover:text-red-400 text-xs p-1"
                        >
                          🗑️
                        </button>
                      </div>

                      <p className="text-gray-200 mt-1 whitespace-pre-wrap">{entry.beschreibung}</p>

                      {entry.teilenummern && (
                        <div className="mt-1.5 pt-1.5 border-t border-gray-800 text-[11px] text-blue-400 font-mono">
                          <span>📦 Teile:</span> {entry.teilenummern}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 text-xs py-6">
                    Noch keine Historien-Einträge vorhanden.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isDocsOpen && selectedVehicle && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setIsDocsOpen(false)}
          >
            <div
              className="bg-gray-800 border border-gray-700 rounded-2xl p-4 max-w-md w-full shadow-2xl space-y-3 max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-gray-700 pb-2 shrink-0">
                <div>
                  <h2 className="text-base font-bold text-white">📎 Dokumente & Dateien</h2>
                  <p className="text-[11px] text-gray-400">{selectedVehicle.kennzeichen}</p>
                </div>
                <button
                  onClick={() => setIsDocsOpen(false)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-1 text-base"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={handleAddDocument}
                className="bg-gray-900 p-2.5 rounded-xl border border-gray-700 space-y-2.5 shrink-0 text-xs"
              >
                <h3 className="font-bold text-teal-400 uppercase tracking-wider text-[11px]">
                  Dokument hinzufügen
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">Kategorie:</label>
                    <select
                      value={docForm.kategorie}
                      onChange={(e) => setDocForm({ ...docForm, kategorie: e.target.value })}
                      className="w-full p-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                    >
                      <option value="Rechnungen">Rechnungen</option>
                      <option value="ABEs">ABEs & Gutachten</option>
                      <option value="Fehlerspeicher">Fehlerspeicher</option>
                      <option value="Sonstige">Sonstige</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Datum:</label>
                    <input
                      type="date"
                      value={docForm.datum}
                      onChange={(e) => setDocForm({ ...docForm, datum: e.target.value })}
                      className="w-full p-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-400">Titel / Bezeichnung:</label>
                  <input
                    type="text"
                    value={docForm.titel}
                    onChange={(e) => setDocForm({ ...docForm, titel: e.target.value })}
                    placeholder="z.B. Rechnung Inspektion..."
                    className="w-full p-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                  />
                </div>

                <div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleDocFileSelect}
                    className="w-full text-xs text-gray-300 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-bold file:bg-teal-600 file:text-white cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-lg font-bold text-xs shadow"
                >
                  + Dokument speichern
                </button>
              </form>

              <div className="overflow-y-auto flex-grow space-y-2 pr-1 text-xs">
                {selectedVehicle.dokumente && selectedVehicle.dokumente.length > 0 ? (
                  selectedVehicle.dokumente.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-gray-900 p-2.5 rounded-xl border border-gray-700 flex justify-between items-center"
                    >
                      <div>
                        <span className="font-bold text-white block">{doc.titel}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{doc.datum} ({doc.kategorie})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.dateiData && (
                          <button
                            onClick={() => openDocumentInNewTab(doc)}
                            className="text-xs bg-gray-800 text-teal-400 px-2 py-1 rounded border border-gray-600"
                          >
                            👁️ Öffnen
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-gray-500 hover:text-red-400 text-xs"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 text-xs py-6">
                    Keine Dokumente hinterlegt.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isModalOpen &&
          selectedVehicle &&
          selectedVehicle.bilder &&
          selectedVehicle.bilder[activeImageIndex] && (
            <div
              className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            >
              <div className="relative max-w-4xl w-full flex flex-col items-center">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="absolute -top-12 right-0 bg-gray-800 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded-lg border border-gray-600 shadow-lg transition-all z-10 text-xs"
                >
                  ✕ Schließen
                </button>

                <img
                  src={selectedVehicle.bilder[activeImageIndex]}
                  alt="Fahrzeugschein Großansicht"
                  className="max-h-[85vh] w-auto rounded-xl border-2 border-gray-700 shadow-2xl object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
