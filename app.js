const { useState, useEffect, useRef } = React;

// --- Components ---

const Header = ({ vault }) => {
    const currency = vault?.col_1?.currency || 0;
    const gems = vault?.col_2?.gems || 0;

    return (
        <header className="fixed top-0 left-0 right-0 h-16 glass-panel z-50 flex items-center justify-between px-4 shadow-lg">
            <div className="flex items-center gap-2">
                <i className="fa-solid fa-layer-group text-blue-500 text-xl"></i>
                <h1 className="font-bold text-lg tracking-wider">REMIX<span className="text-blue-500">ARENA</span></h1>
            </div>
            
            <div className="flex gap-4">
                <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-yellow-500/30">
                    <img src="coin.png" className="w-5 h-5 object-contain" />
                    <span className="font-mono text-yellow-400 font-bold">{currency}</span>
                </div>
                <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-purple-500/30">
                    <img src="gem.png" className="w-5 h-5 object-contain" />
                    <span className="font-mono text-purple-400 font-bold">{gems}</span>
                </div>
            </div>
        </header>
    );
};

const ImageCard = ({ data, onRemix }) => {
    const isRemix = data.type === 'remix';
    
    return (
        <div className="image-card relative group rounded-xl overflow-hidden bg-gray-800 mb-4 border border-gray-700">
            <div className="relative aspect-square">
                <img src={data.imageUrl} alt={data.prompt} className="w-full h-full object-cover" />
                
                {isRemix && (
                    <div className="absolute top-2 right-2 bg-purple-600 text-xs px-2 py-1 rounded shadow-lg font-bold">
                        REMIXED
                    </div>
                )}
            </div>
            
            <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <img src={data.authorAvatar} className="w-6 h-6 rounded-full border border-gray-500" />
                        <span className="text-xs text-gray-300 font-semibold truncate max-w-[100px]">{data.authorName}</span>
                    </div>
                    <button 
                        onClick={() => onRemix(data)}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors"
                    >
                        <i className="fa-solid fa-wand-magic-sparkles"></i> Remix
                    </button>
                </div>
                <p className="text-xs text-gray-400 line-clamp-2 italic">"{data.prompt}"</p>
            </div>
        </div>
    );
};

const GeneratorModal = ({ isOpen, onClose, type, sourceImage, onComplete }) => {
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const finalPrompt = type === 'remix' 
                ? `Remix of existing image, ${prompt}` 
                : prompt;

            const options = {
                prompt: finalPrompt,
                aspect_ratio: "1:1"
            };

            // If remixing, we need to convert the source URL to base64 first or send it if supported.
            // Using standard imageGen. If remixing, we use image_inputs
            if (type === 'remix' && sourceImage) {
                 // Fetch blob to get base64 
                 const resp = await fetch(sourceImage.imageUrl);
                 const blob = await resp.blob();
                 const reader = new FileReader();
                 
                 await new Promise((resolve) => {
                     reader.onloadend = () => {
                        options.image_inputs = [{ url: reader.result }];
                        resolve();
                     };
                     reader.readAsDataURL(blob);
                 });
            }

            const result = await websim.imageGen(options);

            // Play sound
            const audio = new Audio(type === 'remix' ? 'sfx_earn.mp3' : 'sfx_shutter.mp3');
            audio.volume = 0.5;
            audio.play();

            onComplete(result.url, prompt);
            onClose();
            setPrompt("");
        } catch (err) {
            console.error(err);
            alert("Generation failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-600 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <i className="fa-solid fa-xmark text-xl"></i>
                </button>

                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    {type === 'remix' ? <span className="text-purple-400">Remix Image</span> : <span className="text-blue-400">Generate New</span>}
                </h2>

                {type === 'remix' && sourceImage && (
                    <div className="mb-4 relative rounded-lg overflow-hidden h-32 w-full">
                        <img src={sourceImage.imageUrl} className="w-full h-full object-cover opacity-60" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="bg-black/50 px-2 py-1 rounded text-xs">Source Image</span>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="loader mb-4"></div>
                        <p className="text-blue-400 animate-pulse">AI is dreaming...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <label className="block text-sm text-gray-400 mb-2">
                            {type === 'remix' ? "How should we change this?" : "What do you want to see?"}
                        </label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="w-full bg-black/40 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none resize-none h-24 mb-4"
                            placeholder={type === 'remix' ? "Make it cyberpunk, add rain..." : "A futuristic city in the clouds..."}
                            required
                        ></textarea>
                        
                        <button 
                            type="submit"
                            className={`w-full py-3 rounded-lg font-bold text-lg flex items-center justify-center gap-2 ${
                                type === 'remix' 
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500' 
                                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500'
                            }`}
                        >
                            {type === 'remix' ? (
                                <><span>Remix for +5</span> <img src="gem.png" className="w-5 h-5"/></>
                            ) : (
                                <><span>Generate for +10</span> <img src="coin.png" className="w-5 h-5"/></>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

// --- Main App ---

const App = () => {
    const [vault, setVault] = useState(null);
    const [feed, setFeed] = useState([]);
    const [isGenModalOpen, setIsGenModalOpen] = useState(false);
    const [remixTarget, setRemixTarget] = useState(null); // null or image object

    useEffect(() => {
        // Initialize User Data
        const init = async () => {
            await DataStore.getMyVault(); // Ensure vault exists
            
            // Subscribe to vault changes (currency/gems)
            DataStore.subscribeToMyVault((data) => {
                setVault(data);
            });

            // Subscribe to Public Feed
            DataStore.subscribeToFeed((records) => {
                setFeed(records);
            });
        };
        init();
    }, []);

    const handleGenerate = async (url, prompt) => {
        await DataStore.addGeneration(url, prompt);
        // Play earn sound
        new Audio('sfx_earn.mp3').play();
    };

    const handleRemixComplete = async (url, prompt) => {
        if (remixTarget) {
            await DataStore.addRemix(url, prompt, remixTarget.imageUrl);
             // Play earn sound
            new Audio('sfx_earn.mp3').play();
        }
    };

    const openRemix = (imageRecord) => {
        setRemixTarget(imageRecord);
    };

    return (
        <div className="h-screen flex flex-col bg-gray-900">
            <Header vault={vault} />

            <main className="flex-1 overflow-y-auto feed-scroll pt-20 pb-24 px-4 max-w-2xl mx-auto w-full">
                {feed.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20">
                        <i className="fa-solid fa-image text-4xl mb-4"></i>
                        <p>No images yet. Be the first to generate!</p>
                    </div>
                ) : (
                    <div className="columns-1 sm:columns-2 gap-4">
                        {feed.map(item => (
                            <div key={item.id} className="break-inside-avoid">
                                <ImageCard data={item} onRemix={openRemix} />
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Floating Action Button */}
            <button 
                onClick={() => setIsGenModalOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 shadow-xl flex items-center justify-center text-white z-40 transition-transform hover:scale-110 active:scale-95 neon-border"
            >
                <i className="fa-solid fa-plus text-2xl"></i>
            </button>

            {/* Modals */}
            <GeneratorModal 
                isOpen={isGenModalOpen} 
                onClose={() => setIsGenModalOpen(false)}
                type="generate"
                onComplete={handleGenerate}
            />

            <GeneratorModal 
                isOpen={!!remixTarget} 
                onClose={() => setRemixTarget(null)}
                type="remix"
                sourceImage={remixTarget}
                onComplete={handleRemixComplete}
            />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);