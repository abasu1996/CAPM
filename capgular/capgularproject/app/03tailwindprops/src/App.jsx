

import "./App.css";
import Card from "./components/Card.jsx";

function App() {
  return (
    <>
      <h1 className="bg-green-400 font-black pt-2 text-black rounded-2xl mb-5">
        Tailwaind Test
      </h1>

      <Card className="mb-10" userName="John Doe" price="$ 100"/>
      <Card className="mb-5" userName="Jane Smith" price="$ 200"/>

    </>
  );
}

export default App;
