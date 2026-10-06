class User(AbstractUser):
    created_at = models.DateTimeField(auto_now_add=True)

    # ❌ Retire ce bloc Meta
    # class Meta:
    #     db_table = 'accounts_user'

    def __str__(self):
        return self.username
