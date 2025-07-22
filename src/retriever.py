from contextlib import contextmanager
from typing import Generator
import os
from langchain_core.runnables import RunnableConfig
from langchain_core.vectorstores import VectorStoreRetriever
from src.configuration import Configuration
from langchain_core.embeddings import Embeddings

def make_text_encoder(model: str) -> Embeddings:
    """Connect to the configured text encoder."""
    provider, model = model.split("/", maxsplit=1)
    match provider:
        case "openai":
            from langchain_openai import OpenAIEmbeddings
            return OpenAIEmbeddings(model=model)
        case _:
            raise ValueError(f"Unsupported embedding provider: {provider}")

@contextmanager
def make_retriever(
    config: RunnableConfig,
    index_path: str = "./faiss_index"
) -> Generator[VectorStoreRetriever, None, None]:
    """Windows-compatible FAISS-based vector store with persistence."""
    from langchain_community.vectorstores import FAISS
    import numpy as np

    configuration = Configuration.from_runnable_config(config)
    embedding_model = make_text_encoder(configuration.embedding_model)

    # Try to load existing index
    if os.path.exists(index_path):
        try:
            vstore = FAISS.load_local(
                index_path, 
                embedding_model, 
                allow_dangerous_deserialization=True
            )
            print(f"Loaded existing FAISS index from {index_path} with {vstore.index.ntotal} documents")
        except Exception as e:
            print(f"Failed to load existing index: {e}. Creating new one.")
            vstore = _create_empty_faiss_index(embedding_model)
    else:
        vstore = _create_empty_faiss_index(embedding_model)
        print(f"Created new empty FAISS index")

    try:
        yield vstore.as_retriever()
    finally:
        if vstore.index.ntotal > 0:
            try:
                vstore.save_local(index_path)
                print(f"Saved FAISS index to {index_path} with {vstore.index.ntotal} documents")
            except Exception as e:
                print(f"Failed to save index: {e}")


def _create_empty_faiss_index(embedding_model: Embeddings):
    """Create an empty FAISS index without dummy documents."""
    from langchain_community.vectorstores import FAISS
    from langchain_community.docstore.in_memory import InMemoryDocstore
    import faiss
    
    sample_embedding = embedding_model.embed_query("sample")
    dimension = len(sample_embedding)
    
    index = faiss.IndexFlatL2(dimension)
    
    vstore = FAISS(
        embedding_function=embedding_model,
        index=index,
        docstore=InMemoryDocstore(),
        index_to_docstore_id={}
    )
    
    return vstore