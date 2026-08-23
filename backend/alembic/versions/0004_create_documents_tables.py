"""crear tablas documents, original_images, generated_pdfs, extracted_texts, audit_log

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("doc_type", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed', 'reprocessing')",
            name="ck_documents_status",
        ),
    )
    op.create_index("idx_documents_user", "documents", ["user_id"])
    op.create_index("idx_documents_folder", "documents", ["folder_id"])
    op.create_index("idx_documents_status", "documents", ["status"])
    op.create_index("idx_documents_created", "documents", ["created_at"], postgresql_ops={"created_at": "DESC"})

    op.create_table(
        "original_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("minio_path", sa.String(500), nullable=False),
        sa.Column("file_format", sa.String(10), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger, nullable=False),
        sa.Column("sha256_hash", sa.String(64), nullable=False),
        sa.Column("width_px", sa.Integer, nullable=True),
        sa.Column("height_px", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "generated_pdfs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("minio_path", sa.String(500), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("file_size_bytes", sa.BigInteger, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_generated_pdfs_document", "generated_pdfs", ["document_id"])

    op.create_table(
        "extracted_texts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("raw_text", sa.Text, nullable=False),
        sa.Column("tsv_content", postgresql.TSVECTOR, nullable=False),
        sa.Column("ocr_confidence", sa.Float, nullable=True),
        sa.Column("ocr_engine", sa.String(20), nullable=False, server_default="tesseract"),
        sa.Column("word_count", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_extracted_texts_tsv", "extracted_texts", ["tsv_content"], postgresql_using="gin")

    op.execute("""
        CREATE OR REPLACE FUNCTION update_tsv_content()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.tsv_content := to_tsvector('spanish', COALESCE(NEW.raw_text, ''));
            NEW.word_count := array_length(
                string_to_array(trim(COALESCE(NEW.raw_text, '')), ' '), 1
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_update_tsv
        BEFORE INSERT OR UPDATE OF raw_text ON extracted_texts
        FOR EACH ROW EXECUTE FUNCTION update_tsv_content();
    """)

    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("ip_address", postgresql.INET, nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("details", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_audit_user", "audit_log", ["user_id"])
    op.create_index("idx_audit_action", "audit_log", ["action"])
    op.create_index("idx_audit_created", "audit_log", ["created_at"], postgresql_ops={"created_at": "DESC"})


def downgrade() -> None:
    op.drop_table("audit_log")
    op.execute("DROP TRIGGER IF EXISTS trg_update_tsv ON extracted_texts")
    op.execute("DROP FUNCTION IF EXISTS update_tsv_content")
    op.drop_index("idx_extracted_texts_tsv", table_name="extracted_texts")
    op.drop_table("extracted_texts")
    op.drop_index("idx_generated_pdfs_document", table_name="generated_pdfs")
    op.drop_table("generated_pdfs")
    op.drop_table("original_images")
    op.drop_index("idx_documents_created", table_name="documents")
    op.drop_index("idx_documents_status", table_name="documents")
    op.drop_index("idx_documents_folder", table_name="documents")
    op.drop_index("idx_documents_user", table_name="documents")
    op.drop_table("documents")
