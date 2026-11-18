<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;

class ShaqsiyadUserSeeder extends Seeder
{
    public function run(): void
    {
        $people = Http::get('https://shaqsiyad.example/api/v1/fixtures', [
            'shape' => 'users',
            'count' => 50,
            'seed' => 1,
        ])->throw()->json();

        foreach ($people as $person) {
            User::updateOrCreate(
                ['email' => $person['email']],
                ['name' => $person['fullName'], 'password' => Hash::make('password')],
            );
        }
    }
}
